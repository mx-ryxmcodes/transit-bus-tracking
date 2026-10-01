/** Shared realtime contract (Socket.IO). Imported by backend and frontend. */
export const WS = {
  // client -> server
  SUB_TRIP: 'subscribe:trip',
  SUB_ROUTE: 'subscribe:route',
  SUB_FLEET: 'subscribe:fleet',
  GPS_PING: 'gps:ping',
  // server -> client
  BUS_POSITION: 'bus:position',
  TRIP_ETA: 'trip:eta',
  TRIP_STATUS: 'trip:status',
  ALERT_NEW: 'alert:new',
  ALERT_RESOLVED: 'alert:resolved',
  LOCATION_LOST: 'bus:location_unavailable',
  DISPATCH_NOTICE: 'dispatcher:notice',
} as const;

export interface LivePosition {
  tripId: string; busId: string; busNumber: string; routeId: string;
  lat: number; lng: number; speedKmh: number | null; ts: number;
  simulated: boolean; delayMinutes: number;
  tripStatus: 'IN_PROGRESS' | 'DELAYED';
  locationAvailable: boolean;
}
export interface StopEta {
  stopId: string; stopName: string; stopOrder: number;
  etaMins: number | null; status: 'On Time' | 'Delayed' | 'Passed';
}
export interface TripEtaEvent { tripId: string; busId: string; routeId: string; etas: StopEta[] }
export interface TripStatusEvent {
  tripId: string; busId: string; busNumber: string; routeId: string;
  status: 'IN_PROGRESS' | 'DELAYED' | 'COMPLETED' | 'CANCELLED';
  busStatus: string; delayMinutes: number; locationAvailable: boolean; simulated: boolean;
}
export interface AlertEvent {
  id: string; routeId: string; title: string; description: string;
  impactedStopId: string | null; impactedStopName: string | null;
  delayMinutes: number; createdAt: string; source: string;
}
export interface LocationLostEvent { tripId: string; busId: string; busNumber: string; routeId: string; since: string }
export interface DispatcherNotice { level: 'warning' | 'info'; message: string; tripId?: string; busId?: string; at: string }
