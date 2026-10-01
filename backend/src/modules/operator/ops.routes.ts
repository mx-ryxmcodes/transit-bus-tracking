/** Operator live ops: fleet overview, service alerts, analytics. */
import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@shared/rbac';
import { requirePermission } from '../../middleware/auth';
import { prisma } from '../auth/auth.service';
import { tzDate, tzHour } from '../../lib/time';
import { activeTrips, findActiveByBus } from '../tracking/tracking.service';
import { activeAlerts, publishAlert, resolveAlert } from '../alerts/alerts.service';

const r = Router();

// ───────── Fleet monitor ─────────
r.get('/fleet', requirePermission(Permission.FLEET_MONITOR), async (_q, res) => {
  const buses = await prisma.bus.findMany({
    include: { currentRoute: { select: { id: true, routeName: true } }, currentDriver: { select: { user: { select: { fullName: true } } } } },
    orderBy: { busNumber: 'asc' },
  });
  const counters: Record<string, number> = { AVAILABLE: 0, ON_ROUTE: 0, DELAYED: 0, BREAK: 0, OFFLINE: 0, LOCATION_UNAVAILABLE: 0 };
  const items = buses.map((b) => {
    counters[b.status]++;
    const a = findActiveByBus(b.id);
    const lat = a?.last?.lat ?? b.lastLat, lng = a?.last?.lng ?? b.lastLng;
    return {
      id: b.id, busNumber: b.busNumber, status: b.status, routeId: a?.routeId ?? b.currentRoute?.id ?? null,
      routeName: b.currentRoute?.routeName ?? null, driverName: b.currentDriver?.user.fullName ?? null,
      tripId: a?.id ?? null, simulated: a?.isSimulated ?? false, delayMinutes: a?.delayMinutes ?? 0,
      lat: lat ?? null, lng: lng ?? null, onTrip: !!a,
    };
  });
  res.json({ buses: items, counters, activeTrips: activeTrips.size });
});

// ───────── Service alerts ─────────
const alertGuard = requirePermission(Permission.ALERT_PUBLISH);
r.get('/alerts', alertGuard, async (_q, res) => res.json(await activeAlerts()));
r.post('/alerts', alertGuard, async (req, res, next) => {
  try {
    const b = z.object({
      routeId: z.string().uuid(), title: z.string().min(3).max(120), description: z.string().min(3).max(500),
      impactedStopId: z.string().uuid().nullable().optional(), delayMinutes: z.number().int().min(0).max(240).default(0),
    }).parse(req.body);
    res.status(201).json(await publishAlert(b));
  } catch (e) { next(e); }
});
r.patch('/alerts/:id/resolve', alertGuard, async (req, res, next) => {
  try { res.json(await resolveAlert(req.params.id)); } catch (e) { next(e); }
});

// ───────── Analytics ─────────
const analyticsGuard = requirePermission(Permission.ANALYTICS_VIEW);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

r.get('/analytics/summary', analyticsGuard, async (_q, res) => {
  const today = tzDate(new Date());
  const [recent, openAlerts] = await Promise.all([
    prisma.trip.findMany({ where: { tripStatus: 'COMPLETED', endTime: { gte: new Date(Date.now() - 36 * 3600e3) } }, select: { endTime: true, delayMinutes: true } }),
    prisma.serviceAlert.count({ where: { isActive: true } }),
  ]);
  const todays = recent.filter((t) => t.endTime && tzDate(t.endTime) === today);
  res.json({ completedToday: todays.length, avgDelayToday: avg(todays.map((t) => t.delayMinutes)), activeTrips: activeTrips.size, openAlerts });
});

r.get('/analytics/history', analyticsGuard, async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
  const trips = await prisma.trip.findMany({
    where: { tripStatus: 'COMPLETED', endTime: { gte: new Date(Date.now() - days * 864e5) } },
    select: { startTime: true, endTime: true, delayMinutes: true, durationMins: true, etaErrorMins: true, distanceKm: true },
  });
  const byDay = new Map<string, typeof trips>();
  const byHour: (typeof trips)[] = Array.from({ length: 24 }, () => []);
  for (const t of trips) {
    const k = tzDate(t.endTime ?? t.startTime);
    byDay.set(k, [...(byDay.get(k) ?? []), t]);
    byHour[tzHour(t.startTime)].push(t);
  }
  res.json({
    daily: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, ts]) => ({
      date, completed: ts.length, avgDelay: avg(ts.map((t) => t.delayMinutes)), avgDuration: avg(ts.map((t) => t.durationMins ?? 0)),
      avgEtaError: avg(ts.map((t) => t.etaErrorMins ?? 0)), distanceKm: Math.round(ts.reduce((s, t) => s + t.distanceKm, 0) * 10) / 10,
    })),
    hourly: byHour.map((ts, hour) => ({ hour, trips: ts.length, avgDelay: avg(ts.map((t) => t.delayMinutes)) })),
  });
});

export default r;
