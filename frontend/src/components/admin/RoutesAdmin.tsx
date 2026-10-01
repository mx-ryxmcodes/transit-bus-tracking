'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, del, errMsg, post, put } from '@/lib/api';

interface RouteRow { id: string; routeName: string; startLocation: string; destination: string; totalStops: number; estimatedDurationMins: number; activeStatus: boolean; stops: { stopName: string; latitude: number; longitude: number; stopOrder: number }[] }

// stops are edited as text, one per line:  Stop name, latitude, longitude
const toText = (r: RouteRow) => r.stops.map((s) => `${s.stopName}, ${s.latitude}, ${s.longitude}`).join('\n');
function parseStops(text: string) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const parts = l.split(',').map((p) => p.trim());
    const longitude = Number(parts.pop()), latitude = Number(parts.pop()), stopName = parts.join(', ');
    if (!stopName || Number.isNaN(latitude) || Number.isNaN(longitude)) throw new Error(`Line ${i + 1}: use "Name, lat, lng"`);
    return { stopName, latitude, longitude };
  });
}

export default function RoutesAdmin() {
  const [rows, setRows] = useState<RouteRow[]>([]);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [duration, setDuration] = useState('');
  const [active, setActive] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api<RouteRow[]>('/operator/routes').then(setRows).catch((e) => setErr(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);

  const reset = () => { setEditing(null); setName(''); setText(''); setDuration(''); setActive(true); };
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try {
      const body = { routeName: name, stops: parseStops(text), activeStatus: active, ...(duration ? { estimatedDurationMins: Number(duration) } : {}) };
      editing ? await put(`/operator/routes/${editing}`, body) : await post('/operator/routes', body);
      reset(); load();
    } catch (e) { setErr(errMsg(e)); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card space-y-3">
        <h2 className="font-semibold">{editing ? 'Edit route' : 'Add route'}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input className="input" placeholder="Route name (e.g. Route 05)" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="input" type="number" placeholder="Duration mins (auto if empty)" value={duration} onChange={(e) => setDuration(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
        </div>
        <textarea className="input h-40 font-mono" placeholder={'City Center, 25.3960, 68.3680\nStation Road, 25.3990, 68.3560\n…'} value={text} onChange={(e) => setText(e.target.value)} required />
        <p className="text-xs text-slate-500">One stop per line in travel order: <code>Name, latitude, longitude</code>. Minimum 2 stops.</p>
        <div className="flex items-center gap-2"><button className="btn">{editing ? 'Save (replaces stops)' : 'Create'}</button>{editing && <button type="button" className="btn-ghost" onClick={reset}>Cancel</button>}{err && <span className="text-sm text-red-600">{err}</span>}</div>
      </form>
      <div className="card overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500"><tr><th>Route</th><th>From → To</th><th>Stops</th><th>Duration</th><th>Active</th><th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} className="border-t"><td className="py-1.5 font-medium">{r.routeName}</td><td>{r.startLocation} → {r.destination}</td><td>{r.totalStops}</td><td>{r.estimatedDurationMins} min</td><td>{r.activeStatus ? 'yes' : 'archived'}</td>
            <td className="space-x-2 text-right"><button className="text-blue-700" onClick={() => { setEditing(r.id); setName(r.routeName); setText(toText(r)); setDuration(String(r.estimatedDurationMins)); setActive(r.activeStatus); }}>edit</button>
              <button className="text-red-600" onClick={() => confirm('Archive this route?') && del(`/operator/routes/${r.id}`).then(load)}>archive</button></td></tr>
        ))}</tbody></table></div>
    </div>
  );
}
