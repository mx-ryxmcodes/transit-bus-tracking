/** ENGINE 1 — Passenger journey: direct route match, else transfer recommendation. */
import { prisma } from '../auth/auth.service';
import { haversineKm } from '../../lib/geo';
import { idleEtaMins } from '../eta/eta.service';
import { activeTrips } from '../tracking/tracking.service';

const norm = (s: string) => s.trim().toLowerCase();
const matches = (name: string, q: string) => norm(name).includes(norm(q));

type RouteWithStops = Awaited<ReturnType<typeof loadRoutes>>[number];
type StopRow = RouteWithStops['stops'][number];
const loadRoutes = () => prisma.route.findMany({ where: { activeStatus: true }, include: { stops: { orderBy: { stopOrder: 'asc' } } } });

export interface BusOption {
  busId: string; busNumber: string; tripId: string | null; live: boolean; simulated: boolean;
  etaMins: number | null; status: 'On Time' | 'Delayed' | 'Scheduled' | 'Starting' | 'Location unavailable';
}

/** Buses that can serve `board` on a route: live trips first (ETA from engine 3), then idle buses assigned to the route. */
async function busesFor(routeId: string, board: StopRow): Promise<BusOption[]> {
  const out: BusOption[] = [];
  for (const a of activeTrips.values()) {
    if (a.routeId !== routeId) continue;
    const base = { busId: a.busId, busNumber: a.busNumber, tripId: a.id, live: true, simulated: a.isSimulated };
    if (a.locationLost) { out.push({ ...base, etaMins: null, status: 'Location unavailable' }); continue; }
    if (!a.last) { out.push({ ...base, etaMins: null, status: 'Starting' }); continue; }
    const eta = a.etas.find((e) => e.stopId === board.id);
    if (!eta || eta.status === 'Passed') continue; // bus already went past the boarding stop
    out.push({ ...base, etaMins: eta.etaMins, status: eta.status === 'Delayed' ? 'Delayed' : 'On Time' });
  }
  const idle = await prisma.bus.findMany({ where: { currentRouteId: routeId, status: 'AVAILABLE' } });
  for (const b of idle) {
    out.push({
      busId: b.id, busNumber: b.busNumber, tripId: null, live: false, simulated: false, status: 'Scheduled',
      etaMins: b.lastLat != null && b.lastLng != null ? idleEtaMins({ lat: b.lastLat, lng: b.lastLng }, board) : null,
    });
  }
  return out.sort((x, y) => (x.etaMins ?? 1e9) - (y.etaMins ?? 1e9));
}

const stopDto = (s: StopRow) => ({ id: s.id, name: s.stopName, order: s.stopOrder, lat: s.latitude, lng: s.longitude });

function bestDirect(route: RouteWithStops, origin: string, dest: string) {
  let best: { o: StopRow; d: StopRow } | null = null;
  for (const o of route.stops.filter((s) => matches(s.stopName, origin)))
    for (const d of route.stops.filter((s) => matches(s.stopName, dest)))
      if (o.stopOrder < d.stopOrder && (!best || d.stopOrder - o.stopOrder < best.d.stopOrder - best.o.stopOrder)) best = { o, d };
  return best;
}

const samePlace = (a: StopRow, b: StopRow) =>
  norm(a.stopName) === norm(b.stopName) || haversineKm({ lat: a.latitude, lng: a.longitude }, { lat: b.latitude, lng: b.longitude }) <= 0.3;

/** e.g. Route 03 -> City Center (transfer) -> Route 09. Minimises total stops + a transfer penalty. */
function bestTransfer(ro: RouteWithStops, rd: RouteWithStops, origin: string, dest: string) {
  let best: { o: StopRow; a: StopRow; b: StopRow; d: StopRow; cost: number } | null = null;
  for (const o of ro.stops.filter((s) => matches(s.stopName, origin)))
    for (const d of rd.stops.filter((s) => matches(s.stopName, dest)))
      for (const a of ro.stops.filter((s) => s.stopOrder > o.stopOrder))
        for (const b of rd.stops.filter((s) => s.stopOrder < d.stopOrder && samePlace(a, s))) {
          const cost = a.stopOrder - o.stopOrder + (d.stopOrder - b.stopOrder) + 3;
          if (!best || cost < best.cost) best = { o, a, b, d, cost };
        }
  return best;
}

export async function searchJourney(origin: string, destination: string) {
  const routes = await loadRoutes();
  const direct = [];
  for (const r of routes) {
    const hit = bestDirect(r, origin, destination);
    if (!hit) continue;
    direct.push({
      routeId: r.id, routeName: r.routeName, board: stopDto(hit.o), alight: stopDto(hit.d),
      stopsCount: hit.d.stopOrder - hit.o.stopOrder, buses: await busesFor(r.id, hit.o),
    });
  }
  direct.sort((a, b) => (a.buses[0]?.etaMins ?? 1e9) - (b.buses[0]?.etaMins ?? 1e9));
  if (direct.length) return { origin, destination, direct, transfers: [] };

  const transfers = [];
  for (const ro of routes) for (const rd of routes) {
    if (ro.id === rd.id) continue;
    const t = bestTransfer(ro, rd, origin, destination);
    if (!t) continue;
    transfers.push({
      cost: t.cost,
      legs: [
        { routeId: ro.id, routeName: ro.routeName, from: stopDto(t.o), to: stopDto(t.a), buses: await busesFor(ro.id, t.o) },
        { routeId: rd.id, routeName: rd.routeName, from: stopDto(t.b), to: stopDto(t.d), buses: [] as BusOption[] },
      ],
      transferAt: t.a.stopName,
    });
  }
  transfers.sort((a, b) => a.cost - b.cost);
  return { origin, destination, direct: [], transfers: transfers.slice(0, 5) };
}
