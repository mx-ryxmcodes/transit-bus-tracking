'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errMsg } from '@/lib/api';
import type { BusOption, SearchResult } from '@/lib/types';

const statusColor = (s: BusOption['status']) =>
  s === 'Delayed' ? 'text-red-600' : s === 'On Time' ? 'text-emerald-700' : s === 'Location unavailable' ? 'text-slate-500' : 'text-blue-700';

function Buses({ buses }: { buses: BusOption[] }) {
  if (!buses.length) return <p className="text-sm text-slate-500">No buses currently available on this route.</p>;
  return (
    <ul className="divide-y">
      {buses.map((b) => (
        <li key={b.busId + (b.tripId ?? '')} className="flex items-center gap-3 py-2 text-sm">
          <span className="font-semibold">Bus {b.busNumber}</span>
          {b.simulated && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">SIMULATED</span>}
          <span className={statusColor(b.status)}>{b.status}</span>
          <span className="flex-1 text-right font-medium">{b.etaMins === null ? '—' : `${b.etaMins} min`}</span>
          <Link className="btn-ghost" href={`/track/${b.busId}`}>Track live</Link>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [sugg, setSugg] = useState<string[]>([]);
  const [res, setRes] = useState<SearchResult | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const last = useRef<{ o: string; d: string } | null>(null);

  const run = useCallback(async (o: string, d: string, quiet = false) => {
    if (!quiet) { setLoading(true); setErr(''); }
    try { setRes(await api<SearchResult>(`/search?origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}`)); }
    catch (e) { if (!quiet) setErr(errMsg(e)); }
    finally { if (!quiet) setLoading(false); }
  }, []);

  // keep ETAs fresh while results are on screen
  useEffect(() => {
    const t = setInterval(() => last.current && run(last.current.o, last.current.d, true), 10_000);
    return () => clearInterval(t);
  }, [run]);

  async function suggest(q: string) {
    if (q.trim().length < 2) return;
    try { setSugg((await api<{ names: string[] }>(`/stops/suggest?q=${encodeURIComponent(q)}`)).names); } catch { /* ignore */ }
  }

  return (
    <div className="space-y-4">
      <form className="card grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); last.current = { o: origin, d: destination }; run(origin, destination); }}>
        <datalist id="stop-names">{sugg.map((s) => <option key={s} value={s} />)}</datalist>
        <input className="input" list="stop-names" placeholder="From (e.g. City Center)" value={origin} onChange={(e) => { setOrigin(e.target.value); suggest(e.target.value); }} required />
        <input className="input" list="stop-names" placeholder="To (e.g. University Gate)" value={destination} onChange={(e) => { setDestination(e.target.value); suggest(e.target.value); }} required />
        <button className="btn" disabled={loading}>{loading ? 'Searching…' : 'Find buses'}</button>
      </form>
      {err && <p className="text-sm text-red-600">{err}</p>}

      {res && !res.direct.length && !res.transfers.length && <p className="card text-sm text-slate-600">No direct or one-transfer route found between those stops.</p>}

      {res?.direct.map((d) => (
        <section key={d.routeId} className="card">
          <h2 className="font-semibold">{d.routeName} <span className="font-normal text-slate-500">· {d.board.name} → {d.alight.name} · {d.stopsCount} stops</span></h2>
          <Buses buses={d.buses} />
        </section>
      ))}

      {res && res.transfers.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">No direct bus. Suggested transfers:</p>
          {res.transfers.map((t, i) => (
            <section key={i} className="card space-y-2">
              <h2 className="font-semibold">{t.legs[0].routeName} → change at {t.transferAt} → {t.legs[1].routeName}</h2>
              <div><p className="text-xs uppercase text-slate-500">Leg 1 · board at {t.legs[0].from.name}</p><Buses buses={t.legs[0].buses} /></div>
              <p className="text-sm text-slate-600">Leg 2: board {t.legs[1].routeName} at <b>{t.legs[1].from.name}</b>, get off at <b>{t.legs[1].to.name}</b>.</p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
