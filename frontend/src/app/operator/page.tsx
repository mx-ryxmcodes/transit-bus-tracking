'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { WS, type AlertEvent, type DispatcherNotice, type LivePosition } from '@shared/events';
import { api, errMsg, patch, post } from '@/lib/api';
import { getSocket, reconnectSocket } from '@/lib/socket';
import type { MapBus } from '@/components/LiveMap';

const LiveMap = dynamic(() => import('@/components/LiveMap'), { ssr: false, loading: () => <div className="h-[460px] animate-pulse rounded-lg bg-slate-200" /> });

interface FleetBus { id: string; busNumber: string; status: string; routeId: string | null; routeName: string | null; driverName: string | null; tripId: string | null; simulated: boolean; delayMinutes: number; lat: number | null; lng: number | null; onTrip: boolean }
interface Fleet { buses: FleetBus[]; counters: Record<string, number>; activeTrips: number }
interface RouteRow { id: string; routeName: string; stops: { id: string; stopName: string; latitude: number; longitude: number }[] }
interface Summary { completedToday: number; avgDelayToday: number; activeTrips: number; openAlerts: number }
interface History { daily: { date: string; completed: number; avgDelay: number; avgDuration: number; avgEtaError: number }[]; hourly: { hour: number; trips: number; avgDelay: number }[] }

const COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777'];
const STATUS_STYLE: Record<string, string> = {
  AVAILABLE: 'bg-emerald-100 text-emerald-800', ON_ROUTE: 'bg-blue-100 text-blue-800', DELAYED: 'bg-red-100 text-red-800',
  BREAK: 'bg-amber-100 text-amber-800', OFFLINE: 'bg-slate-200 text-slate-700', LOCATION_UNAVAILABLE: 'bg-slate-300 text-slate-800',
};

export default function OperatorDashboard() {
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hist, setHist] = useState<History | null>(null);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [notices, setNotices] = useState<DispatcherNotice[]>([]);
  const [live, setLive] = useState<Record<string, { lat: number; lng: number; lost: boolean }>>({});
  const [modal, setModal] = useState(false);
  const [err, setErr] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const loadFleet = useCallback(() => api<Fleet>('/operator/fleet').then(setFleet).catch((e) => setErr(errMsg(e))), []);
  const loadStats = useCallback(() => {
    api<Summary>('/operator/analytics/summary').then(setSummary).catch(() => {});
    api<History>('/operator/analytics/history?days=14').then(setHist).catch(() => {});
  }, []);
  const loadAlerts = useCallback(() => api<AlertEvent[]>('/operator/alerts').then(setAlerts).catch(() => {}), []);

  useEffect(() => {
    loadFleet(); loadStats(); loadAlerts();
    api<RouteRow[]>('/operator/routes').then(setRoutes).catch(() => {});
  }, [loadFleet, loadStats, loadAlerts]);

  useEffect(() => {
    const s = getSocket();
    // if the 15-min access cookie expired, refresh it and reconnect so the fleet subscription is authorised again
    const join = () => s.emit(WS.SUB_FLEET, {}, (r: { ok: boolean }) => { if (!r?.ok) post('/auth/refresh').then(reconnectSocket).catch(() => {}); });
    const onPos = (p: LivePosition) => setLive((m) => ({ ...m, [p.busId]: { lat: p.lat, lng: p.lng, lost: !p.locationAvailable } }));
    const refetch = () => { clearTimeout(timer.current); timer.current = setTimeout(() => { loadFleet(); loadStats(); }, 400); }; // debounce
    const onNotice = (n: DispatcherNotice) => { setNotices((x) => [n, ...x].slice(0, 6)); refetch(); };
    s.on('connect', join); s.on(WS.BUS_POSITION, onPos); s.on(WS.TRIP_STATUS, refetch); s.on(WS.DISPATCH_NOTICE, onNotice);
    s.on(WS.ALERT_NEW, loadAlerts); s.on(WS.ALERT_RESOLVED, loadAlerts);
    if (s.connected) join();
    return () => { s.off('connect', join); s.off(WS.BUS_POSITION, onPos); s.off(WS.TRIP_STATUS, refetch); s.off(WS.DISPATCH_NOTICE, onNotice); s.off(WS.ALERT_NEW, loadAlerts); s.off(WS.ALERT_RESOLVED, loadAlerts); };
  }, [loadFleet, loadStats, loadAlerts]);

  const mapBuses: MapBus[] = (fleet?.buses ?? []).flatMap((b) => {
    const l = live[b.id];
    const lat = b.onTrip && l ? l.lat : b.lat, lng = b.onTrip && l ? l.lng : b.lng;
    if (lat == null || lng == null) return [];
    return [{ id: b.id, label: b.busNumber, lat, lng, simulated: b.simulated, delayed: b.status === 'DELAYED', lost: b.status === 'LOCATION_UNAVAILABLE', idle: !b.onTrip }];
  });
  const mapRoutes = routes.map((r, i) => ({ id: r.id, color: COLORS[i % COLORS.length], stops: r.stops.map((s) => ({ id: s.id, name: s.stopName, lat: s.latitude, lng: s.longitude })) }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Fleet overview</h1>
        <button className="btn ml-auto" onClick={() => setModal(true)}>Publish service alert</button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        {Object.entries(fleet?.counters ?? {}).map(([k, v]) => (
          <div key={k} className={`rounded-lg p-3 text-center ${STATUS_STYLE[k]}`}><div className="text-2xl font-bold">{v}</div><div className="text-[11px]">{k.replace('_', ' ')}</div></div>
        ))}
        <div className="card text-center"><div className="text-2xl font-bold">{summary?.completedToday ?? '—'}</div><div className="text-[11px] text-slate-500">TRIPS COMPLETED TODAY</div></div>
        <div className="card text-center"><div className="text-2xl font-bold">{summary?.avgDelayToday ?? '—'}<span className="text-sm"> min</span></div><div className="text-[11px] text-slate-500">AVG DELAY TODAY</div></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <LiveMap routes={mapRoutes} buses={mapBuses} height={460} />
        <div className="space-y-3">
          <section className="card"><h2 className="mb-2 text-sm font-semibold">Dispatcher notices</h2>
            {notices.length ? notices.map((n, i) => <p key={i} className="border-b py-1 text-sm text-amber-800">⚠ {n.message} <span className="text-xs text-slate-400">{new Date(n.at).toLocaleTimeString()}</span></p>) : <p className="text-sm text-slate-500">No issues.</p>}
          </section>
          <section className="card"><h2 className="mb-2 text-sm font-semibold">Active alerts ({alerts.length})</h2>
            {alerts.map((a) => (
              <div key={a.id} className="border-b py-1 text-sm">
                <b>{a.title}</b>{a.delayMinutes > 0 && <span className="text-red-600"> +{a.delayMinutes}m</span>}
                <button className="ml-2 text-xs text-blue-700" onClick={() => patch(`/operator/alerts/${a.id}/resolve`, {}).then(() => { loadAlerts(); loadFleet(); })}>resolve</button>
              </div>
            ))}
          </section>
        </div>
      </div>

      <section className="card overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500"><tr><th>Bus</th><th>Status</th><th>Route</th><th>Driver</th><th>Delay</th></tr></thead>
        <tbody>{fleet?.buses.map((b) => (
          <tr key={b.id} className="border-t"><td className="py-1 font-medium">{b.busNumber}{b.simulated && <span className="ml-1 text-xs text-amber-700">SIM</span>}</td>
            <td><span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[b.status]}`}>{b.status}</span></td>
            <td>{b.routeName ?? '—'}</td><td>{b.driverName ?? '—'}</td><td>{b.delayMinutes ? `${b.delayMinutes} min` : '—'}</td></tr>
        ))}</tbody></table></section>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="card"><h2 className="mb-2 text-sm font-semibold">Completed trips / day</h2>
          <ResponsiveContainer width="100%" height={200}><BarChart data={hist?.daily ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="completed" fill="#2563eb" /></BarChart></ResponsiveContainer></section>
        <section className="card"><h2 className="mb-2 text-sm font-semibold">Average delay (min) / day</h2>
          <ResponsiveContainer width="100%" height={200}><LineChart data={hist?.daily ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line type="monotone" dataKey="avgDelay" stroke="#dc2626" /><Line type="monotone" dataKey="avgEtaError" stroke="#7c3aed" name="ETA error" /></LineChart></ResponsiveContainer></section>
        <section className="card"><h2 className="mb-2 text-sm font-semibold">Trips by start hour (peak hours)</h2>
          <ResponsiveContainer width="100%" height={200}><BarChart data={hist?.hourly ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hour" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="trips" fill="#059669" /></BarChart></ResponsiveContainer></section>
      </div>

      {modal && <AlertModal routes={routes} onClose={() => setModal(false)} onDone={() => { setModal(false); loadAlerts(); loadFleet(); }} />}
    </div>
  );
}

function AlertModal({ routes, onClose, onDone }: { routes: RouteRow[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ routeId: routes[0]?.id ?? '', title: '', description: '', impactedStopId: '', delayMinutes: 15 });
  const [err, setErr] = useState('');
  const stops = routes.find((r) => r.id === f.routeId)?.stops ?? [];
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try { await post('/operator/alerts', { ...f, impactedStopId: f.impactedStopId || null }); onDone(); } catch (e) { setErr(errMsg(e)); }
  }
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="card w-full max-w-md space-y-3">
        <h2 className="font-semibold">Publish service alert</h2>
        <select className="input" value={f.routeId} onChange={(e) => setF({ ...f, routeId: e.target.value, impactedStopId: '' })}>{routes.map((r) => <option key={r.id} value={r.id}>{r.routeName}</option>)}</select>
        <input className="input" placeholder="Title (e.g. Road closure)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} />
        <textarea className="input" placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required minLength={3} />
        <select className="input" value={f.impactedStopId} onChange={(e) => setF({ ...f, impactedStopId: e.target.value })}><option value="">Impacted stop (optional)</option>{stops.map((s) => <option key={s.id} value={s.id}>{s.stopName}</option>)}</select>
        <label className="block text-sm">Added delay (minutes)<input className="input mt-1" type="number" min={0} max={240} value={f.delayMinutes} onChange={(e) => setF({ ...f, delayMinutes: Number(e.target.value) })} /></label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn">Publish</button></div>
      </form>
    </div>
  );
}
