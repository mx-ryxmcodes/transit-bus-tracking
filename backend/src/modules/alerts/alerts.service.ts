import { prisma } from '../auth/auth.service';
import { HttpError } from '../../lib/errors';
import { broadcastAlert, broadcastAlertResolved } from '../../realtime/io';
import { applyAlertDelay } from '../trips/trips.service';
import { toAlertEvent } from './alert.dto';

export async function publishAlert(input: { routeId: string; title: string; description: string; impactedStopId?: string | null; delayMinutes: number }) {
  let stopName: string | null = null;
  if (input.impactedStopId) {
    const stop = await prisma.stop.findUnique({ where: { id: input.impactedStopId } });
    if (!stop || stop.routeId !== input.routeId) throw new HttpError('STOP_NOT_ON_ROUTE', 422);
    stopName = stop.stopName;
  }
  const alert = await prisma.serviceAlert.create({
    data: { routeId: input.routeId, title: input.title, description: input.description, impactedStopId: input.impactedStopId ?? null, delayMinutes: input.delayMinutes, source: 'OPERATOR' },
  });
  await applyAlertDelay(input.routeId, input.delayMinutes);   // Bus -> DELAYED, ETAs recalculated
  broadcastAlert(toAlertEvent(alert, stopName));               // passenger notification
  return alert;
}

export async function resolveAlert(id: string) {
  const alert = await prisma.serviceAlert.findUnique({ where: { id } });
  if (!alert) throw new HttpError('NOT_FOUND', 404);
  if (!alert.isActive) return alert;
  const updated = await prisma.serviceAlert.update({ where: { id }, data: { isActive: false, resolvedAt: new Date() } });
  await applyAlertDelay(alert.routeId, -alert.delayMinutes);
  broadcastAlertResolved(id, alert.routeId);
  return updated;
}

export async function activeAlerts(routeId?: string) {
  const rows = await prisma.serviceAlert.findMany({
    where: { isActive: true, ...(routeId ? { routeId } : {}) },
    include: { impactedStop: true }, orderBy: { createdAt: 'desc' }, take: 50,
  });
  return rows.map((r) => toAlertEvent(r, r.impactedStop?.stopName ?? null));
}
