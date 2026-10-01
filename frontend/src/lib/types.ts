import type { AlertEvent, BusOptionStatus, LivePosition, StopEta } from './shared-types';
export type { AlertEvent, LivePosition, StopEta };

export interface StopDto { id: string; name: string; order: number; lat: number; lng: number }
export interface BusOption {
  busId: string; busNumber: string; tripId: string | null; live: boolean; simulated: boolean;
  etaMins: number | null; status: BusOptionStatus;
}
export interface SearchResult {
  origin: string; destination: string;
  direct: { routeId: string; routeName: string; board: StopDto; alight: StopDto; stopsCount: number; buses: BusOption[] }[];
  transfers: {
    cost: number; transferAt: string;
    legs: { routeId: string; routeName: string; from: StopDto; to: StopDto; buses: BusOption[] }[];
  }[];
}
export interface BusLive {
  bus: { id: string; busNumber: string; status: string };
  route: { id: string; routeName: string; stops: StopDto[] };
  tripId: string | null; simulated: boolean; delayMinutes: number;
  position: LivePosition | null; idlePosition: { lat: number; lng: number } | null;
  etas: StopEta[]; alerts: AlertEvent[];
}
