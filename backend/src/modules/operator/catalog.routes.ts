/** Operator CRUD: buses, routes (+ stops), schedules. */
import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@shared/rbac';
import { requirePermission } from '../../middleware/auth';
import { prisma } from '../auth/auth.service';
import { HttpError } from '../../lib/errors';
import { polylineKm } from '../../lib/geo';

const r = Router();
const BUS_STATUS = ['AVAILABLE', 'ON_ROUTE', 'DELAYED', 'BREAK', 'OFFLINE', 'LOCATION_UNAVAILABLE'] as const;

// ───────── Buses ─────────
const busBody = z.object({
  busNumber: z.string().min(1).max(20), vehicleNumber: z.string().min(3).max(30),
  capacity: z.number().int().min(1).max(200),
  currentRouteId: z.string().uuid().nullable().optional(),
  status: z.enum(BUS_STATUS).optional(),
});
const busGuard = requirePermission(Permission.BUS_MANAGE);

r.get('/buses', busGuard, async (_q, res) => {
  res.json(await prisma.bus.findMany({
    include: { currentRoute: { select: { routeName: true } }, currentDriver: { select: { user: { select: { fullName: true } } } } },
    orderBy: { busNumber: 'asc' },
  }));
});
r.post('/buses', busGuard, async (req, res, next) => {
  try { res.status(201).json(await prisma.bus.create({ data: busBody.parse(req.body) })); } catch (e) { next(e); }
});
r.put('/buses/:id', busGuard, async (req, res, next) => {
  try { res.json(await prisma.bus.update({ where: { id: req.params.id }, data: busBody.partial().parse(req.body) })); } catch (e) { next(e); }
});
r.delete('/buses/:id', busGuard, async (req, res, next) => {
  try { await prisma.bus.delete({ where: { id: req.params.id } }); res.json({ ok: true }); } catch (e) { next(e); }
});

// ───────── Routes & stops ─────────
const stopIn = z.object({ stopName: z.string().min(1).max(80), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const routeBody = z.object({
  routeName: z.string().min(2).max(60),
  startLocation: z.string().optional(), destination: z.string().optional(),
  estimatedDurationMins: z.number().int().min(1).max(600).optional(),
  activeStatus: z.boolean().optional(),
  stops: z.array(stopIn).min(2).max(80),
});
const routeGuard = requirePermission(Permission.ROUTE_MANAGE, Permission.STOP_MANAGE);

function derive(b: z.infer<typeof routeBody>) {
  const pts = b.stops.map((s) => ({ lat: s.latitude, lng: s.longitude }));
  return {
    routeName: b.routeName,
    startLocation: b.startLocation ?? b.stops[0].stopName,
    destination: b.destination ?? b.stops[b.stops.length - 1].stopName,
    estimatedDurationMins: b.estimatedDurationMins ?? Math.max(1, Math.round((polylineKm(pts) / 25) * 60)), // ~25 km/h urban average
    activeStatus: b.activeStatus ?? true,
    totalStops: b.stops.length,
  };
}
const stopRows = (b: z.infer<typeof routeBody>) => b.stops.map((s, i) => ({ ...s, stopOrder: i + 1 }));

r.get('/routes', routeGuard, async (_q, res) => {
  res.json(await prisma.route.findMany({ include: { stops: { orderBy: { stopOrder: 'asc' } } }, orderBy: { routeName: 'asc' } }));
});
r.post('/routes', routeGuard, async (req, res, next) => {
  try {
    const b = routeBody.parse(req.body);
    res.status(201).json(await prisma.route.create({ data: { ...derive(b), stops: { create: stopRows(b) } }, include: { stops: true } }));
  } catch (e) { next(e); }
});
/** Full replace of the route's stop list (stop order = array order). */
r.put('/routes/:id', routeGuard, async (req, res, next) => {
  try {
    const b = routeBody.parse(req.body);
    const out = await prisma.$transaction(async (tx) => {
      await tx.stop.deleteMany({ where: { routeId: req.params.id } });
      return tx.route.update({ where: { id: req.params.id }, data: { ...derive(b), stops: { create: stopRows(b) } }, include: { stops: true } });
    });
    res.json(out);
  } catch (e) { next(e); }
});
/** Routes keep trip history, so DELETE archives (deactivates) instead of removing. */
r.delete('/routes/:id', routeGuard, async (req, res, next) => {
  try { await prisma.route.update({ where: { id: req.params.id }, data: { activeStatus: false } }); res.json({ ok: true }); } catch (e) { next(e); }
});

// ───────── Schedules ─────────
const schedBody = z.object({
  routeId: z.string().uuid(), busId: z.string().uuid().nullable().optional(),
  departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm'),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1), isActive: z.boolean().optional(),
});
const schedGuard = requirePermission(Permission.SCHEDULE_MANAGE);

r.get('/schedules', schedGuard, async (_q, res) => {
  res.json(await prisma.schedule.findMany({
    include: { route: { select: { routeName: true } }, bus: { select: { busNumber: true } } }, orderBy: [{ routeId: 'asc' }, { departureTime: 'asc' }],
  }));
});
r.post('/schedules', schedGuard, async (req, res, next) => {
  try { res.status(201).json(await prisma.schedule.create({ data: schedBody.parse(req.body) })); } catch (e) { next(e); }
});
r.put('/schedules/:id', schedGuard, async (req, res, next) => {
  try { res.json(await prisma.schedule.update({ where: { id: req.params.id }, data: schedBody.partial().parse(req.body) })); } catch (e) { next(e); }
});
r.delete('/schedules/:id', schedGuard, async (req, res, next) => {
  try { await prisma.schedule.delete({ where: { id: req.params.id } }); res.json({ ok: true }); } catch (e) { next(e); }
});

export default r;
