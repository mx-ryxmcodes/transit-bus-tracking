/** Driver portal API. Every route requires DRIVER_PORTAL + the specific trip permission. */
import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@shared/rbac';
import { requirePermission } from '../../middleware/auth';
import { prisma } from '../auth/auth.service';
import { HttpError } from '../../lib/errors';
import { activeTrips } from '../tracking/tracking.service';
import { endTrip, startTrip, updateTripStatus } from '../trips/trips.service';

const r = Router();
r.use(requirePermission(Permission.DRIVER_PORTAL));

r.get('/me', requirePermission(Permission.TRIP_SELECT), async (req, res) => {
  const profile = await prisma.driverProfile.findUnique({
    where: { userId: req.auth!.sub }, include: { user: { select: { fullName: true } }, assignedBus: true },
  });
  if (!profile) throw new HttpError('NOT_A_DRIVER', 403);
  const routes = await prisma.route.findMany({
    where: { activeStatus: true }, select: { id: true, routeName: true, startLocation: true, destination: true }, orderBy: { routeName: 'asc' },
  });
  const buses = profile.assignedBus ? [profile.assignedBus] : await prisma.bus.findMany({ where: { status: 'AVAILABLE' }, orderBy: { busNumber: 'asc' } });
  const a = profile.currentTripId ? activeTrips.get(profile.currentTripId) : undefined;
  res.json({
    driver: { id: profile.id, name: profile.user.fullName, licenseNumber: profile.licenseNumber, status: profile.status },
    buses: buses.map((b) => ({ id: b.id, busNumber: b.busNumber, vehicleNumber: b.vehicleNumber, status: b.status, currentRouteId: b.currentRouteId })),
    routes,
    activeTrip: a ? {
      tripId: a.id, busId: a.busId, busNumber: a.busNumber, routeId: a.routeId, routeName: routes.find((x) => x.id === a.routeId)?.routeName ?? '',
      delayMinutes: a.delayMinutes, tripStatus: a.tripStatus, simulated: a.isSimulated, startedAt: new Date(a.startedAt).toISOString(),
    } : null,
  });
});

r.post('/trips/start', requirePermission(Permission.TRIP_ACTIVATE), async (req, res, next) => {
  try {
    const b = z.object({
      busId: z.string().uuid(), routeId: z.string().uuid(),
      mode: z.enum(['GPS', 'SIMULATOR']).default('GPS'), simulatorSpeedKmh: z.number().min(10).max(150).default(60),
    }).parse(req.body);
    res.status(201).json(await startTrip(req.auth!.sub, b));
  } catch (e) { next(e); }
});

r.patch('/trips/:id/status', requirePermission(Permission.TRIP_UPDATE_STATUS), async (req, res, next) => {
  try {
    const b = z.object({
      status: z.enum(['DELAYED', 'IN_PROGRESS']),
      delayMinutes: z.number().int().min(0).max(240).default(0),
      reason: z.enum(['TRAFFIC', 'VEHICLE_ISSUE', 'ROAD_BLOCK', 'OTHER']).optional(),
    }).parse(req.body);
    res.json(await updateTripStatus(req.auth!.sub, req.params.id, b));
  } catch (e) { next(e); }
});

r.post('/trips/:id/end', requirePermission(Permission.TRIP_END), async (req, res, next) => {
  try {
    const b = z.object({ outcome: z.enum(['COMPLETED', 'CANCELLED']).default('COMPLETED') }).parse(req.body ?? {});
    res.json(await endTrip(req.auth!.sub, req.params.id, b.outcome));
  } catch (e) { next(e); }
});

r.patch('/duty', async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(['ACTIVE', 'OFF_DUTY']) }).parse(req.body);
    const p = await prisma.driverProfile.findUnique({ where: { userId: req.auth!.sub } });
    if (p?.currentTripId) throw new HttpError('TRIP_ALREADY_ACTIVE', 409);
    await prisma.driverProfile.update({ where: { userId: req.auth!.sub }, data: { status } });
    res.json({ ok: true, status });
  } catch (e) { next(e); }
});

export default r;
