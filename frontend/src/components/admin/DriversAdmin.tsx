'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, errMsg, patch, post } from '@/lib/api';

interface Driver {
  id: string; licenseNumber: string; status: string; assignedBus: { id: string; busNumber: string } | null;
  user: { email: string; fullName: string; isActive: boolean }; userId?: string;
  devices: { id: string; fingerprint: string; label: string | null; isTrusted: boolean; lastSeenAt: string | null }[];
}
interface BusRow { id: string; busNumber: string }

export default function DriversAdmin() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [buses, setBuses] = useState<BusRow[]>([]);
  const [f, setF] = useState({ fullName: '', email: '', password: '', licenseNumber: '', phone: '', assignedBusId: '' });
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    api<{ drivers: Driver[] }>('/operator/drivers').then((r) => setDrivers(r.drivers)).catch((e) => setErr(errMsg(e)));
    api<BusRow[]>('/operator/buses').then(setBuses).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try { await post('/operator/drivers', { ...f, phone: f.phone || undefined, assignedBusId: f.assignedBusId || undefined }); setF({ fullName: '', email: '', password: '', licenseNumber: '', phone: '', assignedBusId: '' }); load(); }
    catch (e) { setErr(errMsg(e)); }
  }
  const run = (p: Promise<unknown>) => p.then(load).catch((e) => setErr(errMsg(e)));

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="card grid gap-3 sm:grid-cols-3">
        <h2 className="col-span-full font-semibold">Add driver</h2>
        <input className="input" placeholder="Full name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required />
        <input className="input" type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        <input className="input" type="password" placeholder="Temporary password (min 8)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} />
        <input className="input" placeholder="License number" value={f.licenseNumber} onChange={(e) => setF({ ...f, licenseNumber: e.target.value })} required minLength={4} />
        <input className="input" placeholder="Phone (optional)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <select className="input" value={f.assignedBusId} onChange={(e) => setF({ ...f, assignedBusId: e.target.value })}><option value="">Assigned bus (optional)</option>{buses.map((b) => <option key={b.id} value={b.id}>Bus {b.busNumber}</option>)}</select>
        <div className="col-span-full flex items-center gap-2"><button className="btn">Create driver</button>{err && <span className="text-sm text-red-600">{err}</span>}</div>
      </form>

      {drivers.map((d) => (
        <section key={d.id} className="card space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <b>{d.user.fullName}</b><span className="text-sm text-slate-500">{d.user.email} · {d.licenseNumber} · {d.status}</span>
            <select className="input !w-auto" value={d.assignedBus?.id ?? ''} onChange={(e) => run(patch(`/operator/drivers/${d.id}/assign-bus`, { busId: e.target.value || null }))}>
              <option value="">No assigned bus</option>{buses.map((b) => <option key={b.id} value={b.id}>Bus {b.busNumber}</option>)}
            </select>
          </div>
          <div className="text-sm">
            <p className="text-xs uppercase text-slate-500">Devices</p>
            {d.devices.length === 0 && <p className="text-slate-500">No device has attempted to sign in yet.</p>}
            {d.devices.map((dev) => (
              <div key={dev.id} className="flex items-center gap-3 border-t py-1">
                <code>{dev.fingerprint.slice(0, 8)}…</code><span className="text-slate-500">{dev.lastSeenAt ? new Date(dev.lastSeenAt).toLocaleString() : 'never'}</span>
                <span className={dev.isTrusted ? 'text-emerald-700' : 'text-amber-700'}>{dev.isTrusted ? 'trusted' : 'pending approval'}</span>
                <button className="btn-ghost ml-auto" onClick={() => run(patch(`/operator/devices/${dev.id}/trust`, { isTrusted: !dev.isTrusted }))}>{dev.isTrusted ? 'Revoke' : 'Approve'}</button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
