/** Public (anonymous-friendly) endpoints: route discovery, search, bus live view, alerts. */
import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@shared/rbac';
import { allow } from '../../middleware/auth';
import { prisma } from '../auth/auth.service';
import { HttpError } from '../../lib/errors';
import { searchJourney } from '../search/search.service';
import { activeAlerts } from '../alerts/alerts.service';
import { findActiveByBus, toPosition } from '../tracking/tracking.service';

const r = Router();

r.get('/routes', allow(Permission.ROUTE_SEARCH), async (_q, res) => {
  res.json(await prisma.route.findMany({
    where: { activeStatus: true },
    select: { id: true, routeName: true, startLocation: true, destination: true, totalStops: true, estimatedDurationMins: true },
    orderBy: { routeName: 'asc' },
  }));
});

r.get('/routes/:id', allow(Permission.ROUTE_SEARCH), async (req, res) => {
  const route = await prisma.route.findUnique({ where: { id: req.params.id }, include: { stops: { orderBy: { stopOrder: 'asc' } } } });
  if (!route) throw new HttpError('NOT_FOUND', 404);
  res.json(route);
});

r.get('/stops/suggest', allow(Permission.ROUTE_SEARCH), async (req, res) => {
  const q = z.string().min(1).max(60).parse(req.query.q);
  const rows = await prisma.stop.findMany({
    where: { stopName: { contains: q, mode: 'insensitive' }, route: { activeStatus: true } },
    distinct: ['stopName'], select: { stopName: true }, take: 8,
  });
  res.json({ names: rows.map((x) => x.stopName) });
});

r.get('/search', allow(Permission.ROUTE_SEARCH, Permission.BUS_VIEW), async (req, res) => {
  const { origin, destination } = z.object({ origin: z.string().min(1).max(80), destination: z.string().min(1).max(80) }).parse(req.query);
  res.json(await searchJourney(origin, destination));
});

/** Everything the live-tracking screen needs for one bus (live trip if any, else idle state). */
r.get('/buses/:id/live', allow(Permission.TRACKING_VIEW, Permission.ETA_VIEW), async (req, res) => {
  const bus = await prisma.bus.findUnique({ where: { id: req.params.id } });
  if (!bus) throw new HttpError('NOT_FOUND', 404);
  const a = findActiveByBus(bus.id);
  const routeId = a?.routeId ?? bus.currentRouteId;
  if (!routeId) throw new HttpError('BUS_HAS_NO_ROUTE', 404);
  const route = await prisma.route.findUniqueOrThrow({ where: { id: routeId }, include: { stops: { orderBy: { stopOrder: 'asc' } } } });
  res.json({
    bus: { id: bus.id, busNumber: bus.busNumber, status: bus.status },
    route: { id: route.id, routeName: route.routeName, stops: route.stops.map((s) => ({ id: s.id, name: s.stopName, order: s.stopOrder, lat: s.latitude, lng: s.longitude })) },
    tripId: a?.id ?? null,
    simulated: a?.isSimulated ?? false,
    delayMinutes: a?.delayMinutes ?? 0,
    position: a ? toPosition(a) : null,
    idlePosition: !a && bus.lastLat != null && bus.lastLng != null ? { lat: bus.lastLat, lng: bus.lastLng } : null,
    etas: a?.etas ?? [],
    alerts: await activeAlerts(route.id),
  });
});

r.get('/alerts', allow(Permission.ROUTE_SEARCH), async (req, res) => {
  res.json(await activeAlerts(typeof req.query.routeId === 'string' ? req.query.routeId : undefined));
});

export default r;
