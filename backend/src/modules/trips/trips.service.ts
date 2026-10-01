/** ENGINE 4 — Trip lifecycle: start -> (status updates / alerts) -> end + persisted metrics. */
import { prisma } from '../auth/auth.service';
import { HttpError } from '../../lib/errors';
import { broadcastAlert } from '../../realtime/io';
import { toAlertEvent } from '../alerts/alert.dto';
import { activeTrips, currentBusStatus, emitTripStatus, recomputeEtas, registerActiveTrip, unregisterActiveTrip, type ActiveTrip } from '../tracking/tracking.service';
import { startSimulator, stopSimulator } from '../tracking/simulator';

export const DELAY_REASONS = { TRAFFIC: 'Heavy traffic', VEHICLE_ISSUE: 'Vehicle issue', ROAD_BLOCK: 'Road blockage', OTHER: 'Service disruption' } as const;
export type DelayReason = keyof typeof DELAY_REASONS;

function ownedActive(userId: string, tripId: string): ActiveTrip {
  const a = activeTrips.get(tripId);
  if (!a) throw new HttpError('TRIP_NOT_ACTIVE', 404);
  if (a.driverUserId !== userId) throw new HttpError('NOT_YOUR_TRIP', 403);
  return a;
}

export async function startTrip(userId: string, input: { busId: string; routeId: string; mode: 'GPS' | 'SIMULATOR'; simulatorSpeedKmh: number }) {
  const profile = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!profile) throw new HttpError('NOT_A_DRIVER', 403);
  if (profile.currentTripId) throw new HttpError('TRIP_ALREADY_ACTIVE', 409);
  if (profile.assignedBusId && profile.assignedBusId !== input.busId) throw new HttpError('BUS_NOT_ASSIGNED', 403);

  const [bus, route] = await Promise.all([
    prisma.bus.findUnique({ where: { id: input.busId } }),
    prisma.route.findUnique({ where: { id: input.routeId }, include: { stops: { orderBy: { stopOrder: 'asc' } } } }),
  ]);
  if (!bus) throw new HttpError('BUS_NOT_FOUND', 404);
  if (!route || !route.activeStatus) throw new HttpError('ROUTE_NOT_FOUND', 404);
  if (route.stops.length < 2) throw new HttpError('ROUTE_HAS_NO_STOPS', 422);

  const trip = await prisma.$transaction(async (tx) => {
    // conditional update = race-safe "claim" of the bus
    const claimed = await tx.bus.updateMany({
      where: { id: bus.id, status: 'AVAILABLE' },
      data: { status: 'ON_ROUTE', currentDriverId: profile.id, currentRouteId: route.id },
    });
    if (claimed.count === 0) throw new HttpError('BUS_NOT_AVAILABLE', 409);
    const t = await tx.trip.create({
      data: { busId: bus.id, driverId: profile.id, routeId: route.id, tripStatus: 'IN_PROGRESS', isSimulated: input.mode === 'SIMULATOR' },
    });
    await tx.driverProfile.update({ where: { id: profile.id }, data: { status: 'ACTIVE', currentTripId: t.id } });
    return t;
  });

  const a = registerActiveTrip({
    id: trip.id, busId: bus.id, busNumber: bus.busNumber, routeId: route.id, driverUserId: userId,
    isSimulated: trip.isSimulated, delayMinutes: 0, tripStatus: 'IN_PROGRESS', stops: route.stops, startedAt: trip.startTime.getTime(),
  });
  emitTripStatus(a, 'ON_ROUTE');
  if (trip.isSimulated) startSimulator(a, input.simulatorSpeedKmh);
  return { tripId: trip.id, mode: input.mode, busNumber: bus.busNumber, routeName: route.routeName };
}

/** Driver reports a delay (traffic / vehicle issue / road block) or clears it. Generates a passenger notification. */
export async function updateTripStatus(userId: string, tripId: string, input: { status: 'DELAYED' | 'IN_PROGRESS'; delayMinutes: number; reason?: DelayReason }) {
  const a = ownedActive(userId, tripId);
  a.tripStatus = input.status;
  a.delayMinutes = input.status === 'DELAYED' ? input.delayMinutes : 0;
  await prisma.trip.update({ where: { id: a.id }, data: { tripStatus: a.tripStatus, delayMinutes: a.delayMinutes } });
  if (!a.locationLost) await prisma.bus.update({ where: { id: a.busId }, data: { status: a.tripStatus === 'DELAYED' ? 'DELAYED' : 'ON_ROUTE' } });
  recomputeEtas(a);
  emitTripStatus(a, currentBusStatus(a));

  if (input.status === 'DELAYED') {
    const why = DELAY_REASONS[input.reason ?? 'OTHER'];
    const alert = await prisma.serviceAlert.create({
      data: {
        routeId: a.routeId, source: 'DRIVER', delayMinutes: 0, // driver delay already applied above, don't double count
        title: `Bus ${a.busNumber} delayed — ${why}`,
        description: `Bus ${a.busNumber} is running about ${a.delayMinutes} min late (${why.toLowerCase()}).`,
      },
    });
    broadcastAlert(toAlertEvent(alert));
  }
  return { ok: true, delayMinutes: a.delayMinutes, status: a.tripStatus };
}

export async function endTrip(userId: string, tripId: string, outcome: 'COMPLETED' | 'CANCELLED' = 'COMPLETED') {
  const a = ownedActive(userId, tripId);
  stopSimulator(a.id);
  const end = new Date();
  const durationMins = Math.max(1, Math.round((end.getTime() - a.startedAt) / 60_000));
  const route = await prisma.route.findUniqueOrThrow({ where: { id: a.routeId } });
  // ETA accuracy proxy: |planned route duration - actual duration|
  const etaErrorMins = Math.abs(route.estimatedDurationMins - durationMins);

  await prisma.$transaction([
    prisma.trip.update({
      where: { id: a.id },
      data: {
        tripStatus: outcome, endTime: end, durationMins, etaErrorMins,
        distanceKm: Math.round(a.distanceKm * 100) / 100, delayMinutes: a.delayMinutes,
        currentLat: a.last?.lat, currentLng: a.last?.lng,
      },
    }),
    prisma.bus.update({ where: { id: a.busId }, data: { status: 'AVAILABLE', currentDriverId: null, lastLat: a.last?.lat, lastLng: a.last?.lng } }),
    prisma.driverProfile.updateMany({ where: { userId }, data: { currentTripId: null } }),
  ]);
  emitTripStatus(a, 'AVAILABLE', outcome);
  unregisterActiveTrip(a.id);
  return { tripId: a.id, outcome, durationMins, distanceKm: Math.round(a.distanceKm * 100) / 100, delayMinutes: a.delayMinutes, etaErrorMins };
}

/** Operator alert with delayMinutes shifts every active trip on the route (negative delta when an alert is resolved). */
export async function applyAlertDelay(routeId: string, delta: number) {
  if (!delta) return;
  for (const a of [...activeTrips.values()].filter((t) => t.routeId === routeId)) {
    a.delayMinutes = Math.max(0, a.delayMinutes + delta);
    a.tripStatus = a.delayMinutes > 0 ? 'DELAYED' : 'IN_PROGRESS';
    await prisma.trip.update({ where: { id: a.id }, data: { delayMinutes: a.delayMinutes, tripStatus: a.tripStatus } });
    if (!a.locationLost) await prisma.bus.update({ where: { id: a.busId }, data: { status: a.tripStatus === 'DELAYED' ? 'DELAYED' : 'ON_ROUTE' } });
    recomputeEtas(a);
    emitTripStatus(a, currentBusStatus(a));
  }
}
