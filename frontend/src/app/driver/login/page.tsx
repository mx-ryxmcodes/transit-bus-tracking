'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, errMsg, post } from '@/lib/api';
import { getDeviceFingerprint } from '@/lib/device';
import { useSession } from '@/components/RoleGate';

export default function DriverLogin() {
  const router = useRouter();
  const { refresh } = useSession();
  const [f, setF] = useState({ email: '', password: '' });
  const [fp, setFp] = useState('');
  const [err, setErr] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setFp(getDeviceFingerprint());
    post('/auth/refresh').then(async () => { await refresh(); router.replace('/driver'); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setPending(false);
    try {
      await post('/auth/driver/login', { ...f, deviceFingerprint: fp });
      await refresh();
      router.replace('/driver');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DEVICE_PENDING_APPROVAL') setPending(true);
      else setErr(errMsg(e));
    }
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-10 max-w-sm space-y-3">
      <h1 className="text-lg font-semibold">Driver sign in</h1>
      <input className="input" type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
      <input className="input" type="password" placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
      {err && <p className="text-sm text-red-600">{err}</p>}
      {pending && (
        <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">
          This device must be approved by an operator before you can drive. Ask them to approve device <code className="break-all">{fp.slice(0, 8)}…</code> in Manage → Drivers, then sign in again.
        </p>
      )}
      <button className="btn w-full">Sign in</button>
      <p className="break-all text-xs text-slate-400">Device ID: {fp}</p>
    </form>
  );
}
