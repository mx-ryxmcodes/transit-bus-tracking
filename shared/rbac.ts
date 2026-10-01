/**
 * shared/rbac.ts — SINGLE SOURCE OF TRUTH for roles & permissions.
 * Imported by backend (middleware) and frontend (route guards, UI gating).
 * Later phases: add new permissions here, never hard-code role checks elsewhere.
 */
export const Role = {
  PASSENGER: 'ROLE_PASSENGER',
  DRIVER: 'ROLE_DRIVER',
  OPERATOR: 'ROLE_OPERATOR',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Permission = {
  // --- Public / passenger-facing ---
  ROUTE_SEARCH: 'route:search',
  BUS_VIEW: 'bus:view',
  TRACKING_VIEW: 'tracking:view',
  ETA_VIEW: 'eta:view',
  TRANSFER_VIEW: 'transfer:view',
  ALERT_RECEIVE: 'alert:receive', // subscribe / get personalised notifications
  // --- Driver ---
  DRIVER_PORTAL: 'driver:portal',
  TRIP_SELECT: 'trip:select',     // pick assigned bus + route
  TRIP_ACTIVATE: 'trip:activate',
  TRIP_UPDATE_STATUS: 'trip:update_status',
  TRIP_END: 'trip:end',
  GPS_STREAM: 'gps:stream',
  // --- Operator ---
  ADMIN_DASHBOARD: 'admin:dashboard',
  BUS_MANAGE: 'bus:manage',
  DRIVER_MANAGE: 'driver:manage',
  ROUTE_MANAGE: 'route:manage',
  STOP_MANAGE: 'stop:manage',
  SCHEDULE_MANAGE: 'schedule:manage',
  ALERT_PUBLISH: 'alert:publish',
  FLEET_MONITOR: 'fleet:monitor',
  ANALYTICS_VIEW: 'analytics:view',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];
const P = Permission;

/** Anonymous visitors get these (public search & live tracking). */
export const PUBLIC_PERMISSIONS: readonly Permission[] = [
  P.ROUTE_SEARCH, P.BUS_VIEW, P.TRACKING_VIEW, P.ETA_VIEW, P.TRANSFER_VIEW,
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [Role.PASSENGER]: [...PUBLIC_PERMISSIONS, P.ALERT_RECEIVE],
  [Role.DRIVER]: [
    ...PUBLIC_PERMISSIONS, P.ALERT_RECEIVE,
    P.DRIVER_PORTAL, P.TRIP_SELECT, P.TRIP_ACTIVATE, P.TRIP_UPDATE_STATUS, P.TRIP_END, P.GPS_STREAM,
  ],
  [Role.OPERATOR]: [
    ...PUBLIC_PERMISSIONS, P.ALERT_RECEIVE,
    P.ADMIN_DASHBOARD, P.BUS_MANAGE, P.DRIVER_MANAGE, P.ROUTE_MANAGE, P.STOP_MANAGE,
    P.SCHEDULE_MANAGE, P.ALERT_PUBLISH, P.FLEET_MONITOR, P.ANALYTICS_VIEW,
  ],
};

export function hasPermission(role: Role | null | undefined, perm: Permission): boolean {
  if (!role) return PUBLIC_PERMISSIONS.includes(perm);
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

/** Where each role lands after login. */
export const ROLE_HOME: Record<Role, string> = {
  [Role.PASSENGER]: '/',
  [Role.DRIVER]: '/driver',
  [Role.OPERATOR]: '/operator',
};

/** Frontend route guards (first matching prefix wins). Public routes are not listed. */
export const ROUTE_GUARDS: { prefix: string; roles: readonly Role[] }[] = [
  { prefix: '/operator', roles: [Role.OPERATOR] },
  { prefix: '/driver', roles: [Role.DRIVER] },
  { prefix: '/account', roles: [Role.PASSENGER, Role.DRIVER, Role.OPERATOR] },
];
