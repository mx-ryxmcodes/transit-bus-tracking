'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROLE_HOME, type Role } from '@shared/rbac';
import { api, errMsg, post } from '@/lib/api';
import { useSession } from '@/components/RoleGate';

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const { refresh } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [f, setF] = useState({ email: '', password: '', fullName: '' });
  const [err, setErr] = useState('');

  // Access cookie expired but refresh cookie alive? Restore the session silently and continue.
  useEffect(() => {
    post('/auth/refresh').then(async () => {
      const { user } = await api<{ user: { role: Role } }>('/auth/me');
      await refresh();
      router.replace(next ?? ROLE_HOME[user.role]);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try {
      const { user } = await post<{ user: { role: Role } }>(mode === 'login' ? '/auth/login' : '/auth/register', f);
      await refresh();
      router.replace(next ?? ROLE_HOME[user.role]);
    } catch (e) { setErr(errMsg(e)); }
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-10 max-w-sm space-y-3">
      <h1 className="text-lg font-semibold">{mode === 'login' ? 'Sign in' : 'Create passenger account'}</h1>
      {mode === 'register' && <input className="input" placeholder="Full name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required minLength={2} />}
      <input className="input" type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
      <input className="input" type="password" placeholder="Password (min 8)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="btn w-full">{mode === 'login' ? 'Sign in' : 'Register'}</button>
      <button type="button" className="text-sm text-blue-700" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'New passenger? Create an account' : 'Have an account? Sign in'}
      </button>
      <p className="text-xs text-slate-500">Operators sign in here. Drivers use the Driver portal.</p>
    </form>
  );
}
export default function LoginPage() { return <Suspense><LoginForm /></Suspense>; }
