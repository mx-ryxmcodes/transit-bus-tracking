'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { hasPermission, type Permission, type Role } from '@shared/rbac';

type User = { id: string; email: string; fullName: string; role: Role };
type Session = {
  user: User | null; loading: boolean;
  can: (p: Permission) => boolean; refresh: () => Promise<void>; logout: () => Promise<void>;
};

const Ctx = createContext<Session>(null as unknown as Session);
export const useSession = () => useContext(Ctx);

async function fetchMe(): Promise<User | null> {
  let res = await fetch('/api/auth/me', { credentials: 'include' });
  if (res.status === 401) { // access token expired: try one silent refresh
    const rf = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!rf.ok) return null;
    res = await fetch('/api/auth/me', { credentials: 'include' });
  }
  return res.ok ? (await res.json()).user : null;
}

/** Wrap app/layout.tsx children with this once. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => { setUser(await fetchMe()); setLoading(false); }, []);
  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const value = useMemo<Session>(
    () => ({ user, loading, refresh, logout, can: (p) => hasPermission(user?.role, p) }),
    [user, loading, refresh, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** UI-level gating (cosmetic — the API is the real enforcement). */
export function RoleGate({ permission, roles, fallback = null, children }: {
  permission?: Permission; roles?: Role[]; fallback?: ReactNode; children: ReactNode;
}) {
  const { user, loading, can } = useSession();
  if (loading) return null;
  const okPerm = permission ? can(permission) : true;
  const okRole = roles ? !!user && roles.includes(user.role) : true;
  return <>{okPerm && okRole ? children : fallback}</>;
}
