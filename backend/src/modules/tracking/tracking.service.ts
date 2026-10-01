/**
 * ENGINE 2 — Telemetry & GPS ingestion.
 * Keeps an in-memory cache of active trips so each ping costs zero DB reads.
 * Pipeline: ingest -> validate integrity -> broadcast -> update ETAs. Stale signal => LOCATION_UNAVAILABLE.
 */
import { prisma } from '../auth/auth.service';
import { env } from '../../config/env';
import { haversineKm } from '../../lib/geo';
import { computeStopEtas, type StopLite } from '../eta/eta.service';
import { broadcastEta, broadcastLost, broadcastNotice, broadcastPosition, broadcastStatus } from '../../realtime/io';
import type { LivePosition, StopEta } from '@shared/events';

export interface ActiveTrip {
  id: string; busId: string; busNumber: string; routeId: string; driverUserId: string;
  isSimulated: boolean; delayMinutes: number; tripStatus: 'IN_PROGRESS' | 'DELAYED';
  stops: StopLite[]; startedAt: number;
  last?: { lat: number; lng: number; speedKmh: number | null; ts: number };
  distanceKm: number; lastDbWrite: number; lastEtaAt: number; locationLost: boolean; etas: StopEta[];
}

export const activeTrips = new Map<string, ActiveTrip>();
export const findActiveByBus = (busId: string) => [...activeTrips.values()].find((t) => t.busId === busId);
const log = (e: unknown) => console.error('[tracking]', e);

export function registerActiveTrip(p: Omit<ActiveTrip, 'distanceKm' | 'lastDbWrite' | 'lastEtaAt' | 'locationLost' | 'etas'> & Partial<ActiveTrip>): ActiveTrip {
  const a: ActiveTrip = { distanceKm: 0, lastDbWrite: 0, lastEtaAt: 0, locationLost: false, etas: [], ...p };
  activeTrips.set(a.id, a);
  return a;
}
export const unregisterActiveTrip = (id: string) => { activeTrips.delete(id); };

export const currentBusStatus = (a: ActiveTrip) => (a.locationLost ? 'LOCATION_UNAVAILABLE' : a.tripStatus === 'DELAYED' ? 'DELAYED' : 'ON_ROUTE');

export function toPosition(a: ActiveTrip): LivePosition | null {
  if (!a.last) return null;
  return {
    tripId: a.id, busId: a.busId, busNumber: a.busNumber, routeId: a.routeId,
    lat: a.last.lat, lng: a.last.lng, speedKmh: a.last.speedKmh, ts: a.last.ts,
    simulated: a.isSimulated, delayMinutes: a.delayMinutes, tripStatus: a.tripStatus, locationAvailable: !a.locationLost,
  };
}

export function emitTripStatus(a: ActiveTrip, busStatus: string, statusOverride?: 'COMPLETED' | 'CANCELLED') {
  broadcastStatus({
    tripId: a.id, busId: a.busId, busNumber: a.busNumber, routeId: a.routeId,
    status: statusOverride ?? a.tripStatus, busStatus, delayMinutes: a.delayMinutes,
    locationAvailable: !a.locationLost, simulated: a.isSimulated,
  });
}

export function recomputeEtas(a: ActiveTrip) {
  a.etas = a.last && !a.locationLost ? computeStopEtas(a.stops, a.last, a.last.speedKmh, a.delayMinutes) : [];
  broadcastEta({ tripId: a.id, busId: a.busId, routeId: a.routeId, etas: a.etas });
}

export const getSnapshot = (tripId: string) => {
  const a = activeTrips.get(tripId);
  return a ? { position: toPosition(a), etas: a.etas } : { position: null, etas: [] as StopEta[] };
};

export interface Ping { lat: number; lng: number; speedKmh?: number; ts?: number }
type PingResult = { ok: true } | { ok: false; error: string };

/** Signal-integrity checks (spec: "validate signal integrity"). */
function validate(a: ActiveTrip, p: Ping, now: number): string | null {
  if (![p.lat, p.lng].every(Number.isFinite) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return 'INVALID_COORDINATES';
  if (p.lat === 0 && p.lng === 0) return 'INVALID_COORDINATES';
  const ts = p.ts ?? now;
  if (Math.abs(now - ts) > 30_000) return 'STALE_TIMESTAMP';
  if (p.speedKmh !== undefined && (!Number.isFinite(p.speedKmh) || p.speedKmh < 0 || p.speedKmh > 150)) return 'INVALID_SPEED';
  if (a.last) {
    if (ts <= a.last.ts) return 'OUT_OF_ORDER';
    const km = haversineKm(a.last, p);
    if (km > 0.2 && (km / ((ts - a.last.ts) / 1000)) * 3600 > 200) return 'IMPLAUSIBLE_JUMP';
  }
  return null;
}

export function ingestPing(tripId: string, p: Ping, source: 'DEVICE' | 'SIMULATOR', userId?: string): PingResult {
  const a = activeTrips.get(tripId);
  if (!a) return { ok: false, error: 'TRIP_NOT_ACTIVE' };
  if (source === 'DEVICE') {
    if (a.isSimulated) return { ok: false, error: 'TRIP_IS_SIMULATED' };
    if (a.driverUserId !== userId) return { ok: false, error: 'NOT_YOUR_TRIP' };
  }
  const now = Date.now();
  const err = validate(a, p, now);
  if (err) return { ok: false, error: err };

  if (a.last) { const km = haversineKm(a.last, p); if (km < 1) a.distanceKm += km; }
  a.last = { lat: p.lat, lng: p.lng, speedKmh: p.speedKmh ?? null, ts: p.ts ?? now };

  if (a.locationLost) { // signal is back
    a.locationLost = false;
    prisma.bus.update({ where: { id: a.busId }, data: { status: a.tripStatus === 'DELAYED' ? 'DELAYED' : 'ON_ROUTE' } })
      .then(() => emitTripStatus(a, currentBusStatus(a))).catch(log);
  }
  broadcastPosition(toPosition(a)!);
  if (now - a.lastEtaAt >= 3000) { a.lastEtaAt = now; recomputeEtas(a); }
  if (now - a.lastDbWrite >= 3000) {
    a.lastDbWrite = now;
    prisma.$transaction([
      prisma.trip.update({ where: { id: a.id }, data: { currentLat: p.lat, currentLng: p.lng, lastPingAt: new Date(now) } }),
      prisma.bus.update({ where: { id: a.busId }, data: { lastLat: p.lat, lastLng: p.lng } }),
    ]).catch(log);
  }
  return { ok: true };
}

/** Marks buses LOCATION_UNAVAILABLE when pings stop (never shows fake movement) and notifies dispatchers. */
export function startWatchdog() {
  setInterval(async () => {
    try {
      const th = new Date(Date.now() - env.STALE_SIGNAL_SECONDS * 1000);
      const stale = await prisma.trip.findMany({
        where: {
          tripStatus: { in: ['IN_PROGRESS', 'DELAYED'] },
          bus: { status: { not: 'LOCATION_UNAVAILABLE' } },
          OR: [{ lastPingAt: { lt: th } }, { lastPingAt: null, startTime: { lt: th } }],
        },
        include: { bus: true },
      });
      for (const t of stale) {
        await prisma.bus.update({ where: { id: t.busId }, data: { status: 'LOCATION_UNAVAILABLE' } });
        const a = activeTrips.get(t.id);
        if (a) { a.locationLost = true; a.etas = []; broadcastEta({ tripId: a.id, busId: a.busId, routeId: a.routeId, etas: [] }); }
        broadcastLost({ tripId: t.id, busId: t.busId, busNumber: t.bus.busNumber, routeId: t.routeId, since: th.toISOString() });
        broadcastNotice({ level: 'warning', message: `Bus ${t.bus.busNumber} lost GPS signal`, tripId: t.id, busId: t.busId, at: new Date().toISOString() });
      }
    } catch (e) { log(e); }
  }, 10_000);
}

/** Rebuild the in-memory cache after a server restart. */
export async function rehydrateActiveTrips() {
  const trips = await prisma.trip.findMany({
    where: { tripStatus: { in: ['IN_PROGRESS', 'DELAYED'] } },
    include: { bus: true, driver: true, route: { include: { stops: { orderBy: { stopOrder: 'asc' } } } } },
  });
  for (const t of trips) {
    registerActiveTrip({
      id: t.id, busId: t.busId, busNumber: t.bus.busNumber, routeId: t.routeId, driverUserId: t.driver.userId,
      isSimulated: t.isSimulated, delayMinutes: t.delayMinutes, tripStatus: t.tripStatus === 'DELAYED' ? 'DELAYED' : 'IN_PROGRESS',
      stops: t.route.stops, startedAt: t.startTime.getTime(), distanceKm: t.distanceKm,
      last: t.currentLat != null && t.currentLng != null ? { lat: t.currentLat, lng: t.currentLng, speedKmh: null, ts: t.lastPingAt?.getTime() ?? Date.now() } : undefined,
      locationLost: t.bus.status === 'LOCATION_UNAVAILABLE',
    });
  }
  if (trips.length) console.log(`[tracking] rehydrated ${trips.length} active trip(s)`);
}
