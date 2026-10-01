import type { Server } from 'socket.io';
import { WS, type AlertEvent, type DispatcherNotice, type LivePosition, type LocationLostEvent, type TripEtaEvent, type TripStatusEvent } from '@shared/events';

let io: Server | null = null;
export const setIO = (s: Server) => { io = s; };

const tripRoute = (tripId: string, routeId: string) => io?.to(`trip:${tripId}`).to(`route:${routeId}`).to('fleet');

export const broadcastPosition = (p: LivePosition) => tripRoute(p.tripId, p.routeId)?.emit(WS.BUS_POSITION, p);
export const broadcastEta = (e: TripEtaEvent) => tripRoute(e.tripId, e.routeId)?.emit(WS.TRIP_ETA, e);
export const broadcastStatus = (e: TripStatusEvent) => tripRoute(e.tripId, e.routeId)?.emit(WS.TRIP_STATUS, e);
export const broadcastLost = (e: LocationLostEvent) => tripRoute(e.tripId, e.routeId)?.emit(WS.LOCATION_LOST, e);
export const broadcastAlert = (a: AlertEvent) => io?.to(`route:${a.routeId}`).to('fleet').emit(WS.ALERT_NEW, a);
export const broadcastAlertResolved = (id: string, routeId: string) => io?.to(`route:${routeId}`).to('fleet').emit(WS.ALERT_RESOLVED, { id, routeId });
export const broadcastNotice = (n: DispatcherNotice) => io?.to('fleet').emit(WS.DISPATCH_NOTICE, n);
