'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WS } from '@shared/events';
import { api, errMsg, patch, post } from '@/lib/api';
import { getSocket, reconnectSocket } from '@/lib/socket';

interface Me {
  driver: { id: string; name: string; licenseNumber: string; status: string };
  buses: { id: string; busNumber: string; vehicleNumber: string; currentRouteId: string | null }[];
  routes: { id: string; routeName: string; startLocation: string; destination: string }[];
  activeTrip: { tripId: string; busNumber: string; routeName: string; delayMinutes: number; tripStatus: string; simulated: boolean; startedAt: string } | null;
}
type Ack = { ok: boolean; error?: string };

export default function DriverPortal() {
  const [me, setMe] = useState<Me | null>(null);
  const [busId, setBusId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [mode, setMode] = useState<'GPS' | 'SIMULATOR'>('GPS');
  const [simSpeed, setSimSpeed] = useState(60);
  const [reason, setReason] = useState('TRAFFIC');
  const [delay, setDelay] = useState(10);
  const [gps, setGps] = useState('idle');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const lastSent = useRef(0);

  const load = useCallback(async () => {
    const d = await api<Me>('/driver/me');
    setMe(d);
    setBusId((b) => b || d.buses[0]?.id || '');
    setRouteId((r) => r || d.buses[0]?.currentRouteId || d.routes[0]?.id || '');
  }, []);
  useEffect(() => { load().catch((e) => setMsg(errMsg(e))); }, [load]);

  const trip = me?.activeTrip ?? null;

  // access cookie lasts 15 min: refresh periodically and reconnect the socket so pings keep authenticating
  useEffect(() => {
    const t = setInterval(() => post('/auth/refresh').then(reconnectSocket).catch(() => setMsg('Session expired — sign in again')), 10 * 60_000);
    return () => clearInterval(t);
  }, []);

  // Hardware GPS streamer (only for real-GPS trips)
  useEffect(() => {
    if (!trip || trip.simulated) return;
    if (!('geolocation' in navigator)) { setGps('GPS not supported on this device'); return; }
    const s = getSocket();
    let wake: WakeLockSentinel | null = null;
    (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinel> } }).wakeLock?.request('screen').then((w) => { wake = w; }).catch(() => {});
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now();
        if (now - lastSent.current < 1000) return; // max 1 ping/s
        lastSent.current = now;
        s.emit(WS.GPS_PING, {
          tripId: trip.tripId, lat: p.coords.latitude, lng: p.coords.longitude,
          speedKmh: p.coords.speed != null ? p.coords.speed * 3.6 : undefined, ts: p.timestamp,
        }, (r: Ack) => {
          setGps(r.ok ? '● streaming' : `rejected: ${r.error}`);
          if (r.error === 'TOKEN_EXPIRED') post('/auth/refresh').then(reconnectSocket);
        });
      },
      (err) => setGps(`GPS error: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
    return () => { navigator.geolocation.clearWatch(id); wake?.release().catch(() => {}); };
  }, [trip?.tripId, trip?.simulated]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setMsg('');
    try { await fn(); await load(); } catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  }

  if (!me) return <p className="text-slate-500">{msg || 'Loading…'}</p>;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Hello, {me.driver.name}</h1>
      {msg && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{msg}</p>}

      {!trip ? (
        <section className="card space-y-3">
          <h2 className="font-semibold">Start a trip</h2>
          <label className="block text-sm">Bus
            <select className="input mt-1" value={busId} onChange={(e) => setBusId(e.target.value)}>
              {me.buses.map((b) => <option key={b.id} value={b.id}>Bus {b.busNumber} ({b.vehicleNumber})</option>)}
            </select>
          </label>
          <label className="block text-sm">Route
            <select className="input mt-1" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              {me.routes.map((r) => <option key={r.id} value={r.id}>{r.routeName} · {r.startLocation} → {r.destination}</option>)}
            </select>
          </label>
          <fieldset className="text-sm">
            <legend className="mb-1">Location source</legend>
            <label className="mr-4"><input type="radio" checked={mode === 'GPS'} onChange={() => setMode('GPS')} /> Device GPS</label>
            <label><input type="radio" checked={mode === 'SIMULATOR'} onChange={() => setMode('SIMULATOR')} /> Route simulator (demo)</label>
          </fieldset>
          {mode === 'SIMULATOR' && (
            <label className="block text-sm">Simulated speed: {simSpeed} km/h
              <input type="range" min={20} max={150} value={simSpeed} onChange={(e) => setSimSpeed(Number(e.target.value))} className="w-full" />
            </label>
          )}
          <button className="btn w-full" disabled={busy || !busId || !routeId}
            onClick={() => act(() => post('/driver/trips/start', { busId, routeId, mode, simulatorSpeedKmh: simSpeed }))}>Start trip</button>
        </section>
      ) : (
        <>
          <section className="card space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Bus {trip.busNumber} · {trip.routeName}</h2>
              {trip.simulated && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">SIMULATED</span>}
            </div>
            <p className="text-sm text-slate-600">Status: <b>{trip.tripStatus}</b>{trip.delayMinutes > 0 && ` (+${trip.delayMinutes} min)`}</p>
            <p className="text-sm text-slate-600">Location: {trip.simulated ? '● simulator running' : gps}</p>
          </section>

          <section className="card space-y-2">
            <h2 className="font-semibold">Report a delay</h2>
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="TRAFFIC">Traffic</option><option value="VEHICLE_ISSUE">Vehicle issue</option>
                <option value="ROAD_BLOCK">Road block</option><option value="OTHER">Other</option>
              </select>
              <input className="input" type="number" min={1} max={240} value={delay} onChange={(e) => setDelay(Number(e.target.value))} />
            </div>
            <div className="flex gap-2">
              <button className="btn flex-1" disabled={busy} onClick={() => act(() => patch(`/driver/trips/${trip.tripId}/status`, { status: 'DELAYED', delayMinutes: delay, reason }))}>Mark delayed</button>
              <button className="btn-ghost flex-1" disabled={busy} onClick={() => act(() => patch(`/driver/trips/${trip.tripId}/status`, { status: 'IN_PROGRESS', delayMinutes: 0 }))}>Back on time</button>
            </div>
          </section>

          <button className="btn w-full !bg-red-600 hover:!bg-red-700" disabled={busy}
            onClick={() => confirm('End this trip at the terminal?') && act(() => post(`/driver/trips/${trip.tripId}/end`, { outcome: 'COMPLETED' }))}>End trip</button>
          <button className="btn-ghost w-full" disabled={busy}
            onClick={() => confirm('Cancel this trip?') && act(() => post(`/driver/trips/${trip.tripId}/end`, { outcome: 'CANCELLED' }))}>Cancel trip</button>
        </>
      )}
    </div>
  );
}
