export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

/** fetch wrapper: JSON, cookies, and one silent refresh on 401. */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = init;
  const run = () => fetch(`/api${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...headers }, ...rest });
  let res = await run();
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const rf = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (rf.ok) res = await run();
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? 'REQUEST_FAILED');
  return body as T;
}
export const post = <T,>(path: string, data?: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) });
export const put = <T,>(path: string, data: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(data) });
export const patch = <T,>(path: string, data: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(data) });
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' });

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Wrong email or password.',
  EMAIL_TAKEN: 'That email is already registered.',
  USE_DRIVER_LOGIN: 'Drivers sign in from the Driver portal.',
  NOT_A_DRIVER: 'This account is not a driver account.',
  DEVICE_PENDING_APPROVAL: 'This device is waiting for operator approval.',
  TRIP_ALREADY_ACTIVE: 'You already have an active trip.',
  BUS_NOT_AVAILABLE: 'That bus is not available.',
  BUS_NOT_ASSIGNED: 'That bus is not assigned to you.',
  TRIP_NOT_ACTIVE: 'This trip is no longer active.',
  VALIDATION: 'Please check the form values.',
  IN_USE: 'Still referenced by other records (e.g. trip history).',
  DUPLICATE: 'A record with these unique values already exists.',
};
export const errMsg = (e: unknown) => (e instanceof ApiError ? MESSAGES[e.code] ?? e.code : e instanceof Error ? e.message : 'Something went wrong');
