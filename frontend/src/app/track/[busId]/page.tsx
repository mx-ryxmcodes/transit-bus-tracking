'use client';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { WS, type AlertEvent, type LivePosition, type LocationLostEvent, type StopEta, type TripEtaEvent, type TripStatusEvent } from '@shared/events';
import { api, errMsg } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { BusLive } from '@/lib/types';
import StopList from '@/components/StopList';

const LiveMap = dynamic(() => import('@/components/LiveMap'), { ssr: false, loading: () => <div className="h-[420px] animate-pulse rounded-lg bg-slate-200" /> });

export default function TrackPage() {
  const { busId } = useParams<{ busId: string }>();
  const [live, setLive] = useState<BusLive | null>(null);
  const [pos, setPos] = useState<LivePosition | null>(null);
  const [etas, setEtas] = useState<StopEta[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [lost, setLost] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [notifPerm, setNotifPerm] = useState<string>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  const load = useCallback(async () => {
    try {
      const d = await api<BusLive>(`/buses/${busId}/live`);
      setLive(d); setPos(d.position); setEtas(d.etas); setAlerts(d.alerts); setLost(d.position ? !d.position.locationAvailable : false);
    } catch (e) { setError(errMsg(e)); }
  }, [busId]);
  useEffect(() => { load(); }, [load]);

  const routeId = live?.route.id;
  useEffect(() => {
    if (!routeId) return;
    const s = getSocket();
    const join = () => { setConnected(true); s.emit(WS.SUB_ROUTE, { routeId }); };
    const onPos = (p: LivePosition) => { if (p.busId === busId) { setPos(p); setLost(!p.locationAvailable); } };
    const onEta = (e: TripEtaEvent) => { if (e.busId === busId) setEtas(e.etas); };
    const onStatus = (e: TripStatusEvent) => {
      if (e.busId !== busId) return;
      setLost(!e.locationAvailable);
      if (e.status === 'COMPLETED' || e.status === 'CANCELLED') { setPos(null); setEtas([]); }
      load(); // trip started / delay changed / ended -> refresh the snapshot
    };
    const onLost = (e: LocationLostEvent) => { if (e.busId === busId) setLost(true); };
    const onAlert = (a: AlertEvent) => {
      setAlerts((x) => [a, ...x.filter((y) => y.id !== a.id)]);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(a.title, { body: a.description });
    };
    const onResolved = ({ id }: { id: string }) => setAlerts((x) => x.filter((a) => a.id !== id));
    s.on('connect', join); s.on('disconnect', () => setConnected(false));
    s.on(WS.BUS_POSITION, onPos); s.on(WS.TRIP_ETA, onEta); s.on(WS.TRIP_STATUS, onStatus);
    s.on(WS.LOCATION_LOST, onLost); s.on(WS.ALERT_NEW, onAlert); s.on(WS.ALERT_RESOLVED, onResolved);
    if (s.connected) join();
    return () => {
      s.off('connect', join); s.off(WS.BUS_POSITION, onPos); s.off(WS.TRIP_ETA, onEta); s.off(WS.TRIP_STATUS, onStatus);
      s.off(WS.LOCATION_LOST, onLost); s.off(WS.ALERT_NEW, onAlert); s.off(WS.ALERT_RESOLVED, onResolved);
    };
  }, [routeId, busId, load]);

  const map = useMemo(() => {
    if (!live) return null;
    const impacted = new Set(alerts.map((a) => a.impactedStopId).filter(Boolean) as string[]);
    const stops = live.route.stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, highlight: impacted.has(s.id) }));
    const label = `Bus ${live.bus.busNumber}`;
    // when signal is lost we keep the LAST known marker, greyed out, and never animate it
    const buses = pos
      ? [{ id: live.bus.id, label, lat: pos.lat, lng: pos.lng, simulated: pos.simulated, delayed: pos.delayMinutes >= 5, lost }]
      : live.idlePosition ? [{ id: live.bus.id, label: `${label} · not on trip`, lat: live.idlePosition.lat, lng: live.idlePosition.lng, idle: true }] : [];
    return { routes: [{ id: live.route.id, stops }], buses, impacted: [...impacted] };
  }, [live, pos, alerts, lost]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!live || !map) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Bus {live.bus.busNumber} · {live.route.routeName}</h1>
        {pos?.simulated && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">SIMULATED</span>}
        {pos && pos.delayMinutes >= 5 && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Delayed ~{pos.delayMinutes} min</span>}
        {lost && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Location unavailable</span>}
        {!pos && !lost && <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">Waiting for trip to start</span>}
        <span className={`ml-auto text-xs ${connected ? 'text-emerald-600' : 'text-slate-400'}`}>● {connected ? 'live' : 'connecting…'}</span>
        {notifPerm === 'default' && <button className="btn-ghost" onClick={async () => setNotifPerm(await Notification.requestPermission())}>Enable alerts</button>}
      </div>

      {alerts.map((a) => (
        <div key={a.id} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <b>⚠ {a.title}</b>{a.impactedStopName && <span> · near {a.impactedStopName}</span>}
          <p className="text-amber-900">{a.description}{a.delayMinutes > 0 && ` Expect about ${a.delayMinutes} min extra.`}</p>
        </div>
      ))}
      {lost && <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">This bus’s GPS signal is unavailable. The marker shows its last known position and ETAs are paused.</p>}

      <LiveMap routes={map.routes} buses={map.buses} />
      <section className="card">
        <h2 className="mb-2 font-semibold">Stops & arrival times</h2>
        <StopList stops={live.route.stops} etas={etas} impactedStopIds={map.impacted} />
      </section>
    </div>
  );
}
