import type { ServiceAlert } from '@prisma/client';
import type { AlertEvent } from '@shared/events';

export const toAlertEvent = (a: ServiceAlert, impactedStopName: string | null = null): AlertEvent => ({
  id: a.id, routeId: a.routeId, title: a.title, description: a.description,
  impactedStopId: a.impactedStopId, impactedStopName, delayMinutes: a.delayMinutes,
  createdAt: a.createdAt.toISOString(), source: a.source,
});
