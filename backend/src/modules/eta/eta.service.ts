/**
 * ENGINE 3 — Smart ETA calculator.
 *   Distance        = distance ALONG the route polyline (bus -> stop)
 *   Base_Travel_Time = Distance / Current_Speed * 60
 *   Final_ETA        = Base_Travel_Time + Current_Delay_Minutes + Historical_Traffic_Factor
 * Historical_Traffic_Factor = Base_Travel_Time * (peak multiplier - 1), i.e. extra minutes caused by peak hours.
 * Speed is clamped to [10, 80] km/h so a bus stopped at a light doesn't produce an infinite ETA.
 */
import { alongRouteKm, haversineKm, type LatLng } from '../../lib/geo';
import { tzHour } from '../../lib/time';
import type { StopEta } from '@shared/events';

export interface StopLite { id: string; stopName: string; latitude: number; longitude: number; stopOrder: number }

export const DEFAULT_SPEED_KMH = 25;
export const ROAD_FACTOR = 1.3; // straight-line -> road distance, for idle buses off the route
const MIN_SPEED = 10, MAX_SPEED = 80;

/** Historical multiplier by hour (local time). Replace with a learned table once you have trip history. */
export function trafficMultiplier(d = new Date()): number {
  const h = tzHour(d);
  if (h >= 7 && h < 10) return 1.35;   // morning peak
  if (h >= 16 && h < 19) return 1.3;   // evening peak
  if (h >= 10 && h < 16) return 1.1;   // daytime
  return 1.0;
}

export function computeEtaMins(distanceKm: number, speedKmh: number | null, delayMinutes: number, now = new Date()): number {
  const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speedKmh && speedKmh > 0 ? speedKmh : DEFAULT_SPEED_KMH));
  const base = (distanceKm / speed) * 60;
  const traffic = base * (trafficMultiplier(now) - 1);
  return Math.max(0, Math.ceil(base + delayMinutes + traffic));
}

export const etaStatus = (delayMinutes: number): 'On Time' | 'Delayed' => (delayMinutes >= 5 ? 'Delayed' : 'On Time');

export function computeStopEtas(stops: StopLite[], pos: LatLng, speedKmh: number | null, delayMinutes: number, now = new Date()): StopEta[] {
  const pts = stops.map((s) => ({ lat: s.latitude, lng: s.longitude }));
  return stops.map((s, idx) => {
    const d = alongRouteKm(pos, pts, idx);
    if (d === null) return { stopId: s.id, stopName: s.stopName, stopOrder: s.stopOrder, etaMins: null, status: 'Passed' as const };
    return { stopId: s.id, stopName: s.stopName, stopOrder: s.stopOrder, etaMins: computeEtaMins(d, speedKmh, delayMinutes, now), status: etaStatus(delayMinutes) };
  });
}

/** ETA for a bus that is NOT on a trip yet (parked at depot, etc.). */
export function idleEtaMins(from: LatLng, stop: { latitude: number; longitude: number }, now = new Date()): number {
  return computeEtaMins(haversineKm(from, { lat: stop.latitude, lng: stop.longitude }) * ROAD_FACTOR, null, 0, now);
}
