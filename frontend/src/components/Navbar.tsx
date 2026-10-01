'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Permission, Role } from '@shared/rbac';
import { useSession } from './RoleGate';

export default function Navbar() {
  const { user, loading, logout, can } = useSession();
  const router = useRouter();
  return (
    <header className="border-b bg-white">
      <nav className="mx-auto flex max-w-6xl items-center gap-4 p-3 text-sm">
        <Link href="/" className="font-bold text-blue-700">🚌 Smart Transit</Link>
        <Link href="/" className="text-slate-600 hover:text-slate-900">Search</Link>
        {can(Permission.DRIVER_PORTAL) && <Link href="/driver" className="text-slate-600 hover:text-slate-900">Driver portal</Link>}
        {can(Permission.ADMIN_DASHBOARD) && <>
          <Link href="/operator" className="text-slate-600 hover:text-slate-900">Dashboard</Link>
          <Link href="/operator/manage" className="text-slate-600 hover:text-slate-900">Manage</Link>
        </>}
        <span className="flex-1" />
        {loading ? null : user ? (
          <>
            <span className="text-slate-500">{user.fullName} · {user.role.replace('ROLE_', '').toLowerCase()}</span>
            <button className="btn-ghost" onClick={async () => { await logout(); router.push(user.role === Role.DRIVER ? '/driver/login' : '/'); }}>Sign out</button>
          </>
        ) : (
          <>
            <Link href="/login" className="btn-ghost">Sign in</Link>
            <Link href="/driver/login" className="text-slate-500 hover:text-slate-900">Driver</Link>
          </>
        )}
      </nav>
    </header>
  );
}
