/** GPS Simulator engine: walks a bus along the route's stop polyline. Trips started in this mode are flagged isSimulated. */
import { pointAtKm, polylineKm } from '../../lib/geo';
import { ingestPing, type ActiveTrip } from './tracking.service';

const timers = new Map<string, NodeJS.Timeout>();

export function startSimulator(a: ActiveTrip, speedKmh: number) {
  stopSimulator(a.id);
  const pts = a.stops.map((s) => ({ lat: s.latitude, lng: s.longitude }));
  const total = polylineKm(pts);
  let travelled = 0;
  const tick = () => {
    travelled = Math.min(total, travelled + speedKmh / 3600); // 1 tick = 1 second
    const p = pointAtKm(pts, travelled);
    const atEnd = travelled >= total;
    // keeps pinging at the terminal (speed 0) so the watchdog doesn't flag a healthy bus
    ingestPing(a.id, { lat: p.lat, lng: p.lng, speedKmh: atEnd ? 0 : speedKmh, ts: Date.now() }, 'SIMULATOR');
  };
  tick();
  timers.set(a.id, setInterval(tick, 1000));
}

export function stopSimulator(tripId: string) {
  const t = timers.get(tripId);
  if (t) { clearInterval(t); timers.delete(tripId); }
}
export const isSimulating = (tripId: string) => timers.has(tripId);
