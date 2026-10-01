'use client';
// Small generic CRUD table + form used for Buses and Schedules.
import { useCallback, useEffect, useState } from 'react';
import { del, errMsg, api, post, put } from '@/lib/api';

export interface Field {
  key: string; label: string; type: 'text' | 'number' | 'select' | 'days' | 'checkbox';
  options?: { value: string; label: string }[]; required?: boolean; nullable?: boolean;
}
export interface Column<T> { label: string; render: (row: T) => React.ReactNode }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ResourceManager<T extends { id: string }>({ title, endpoint, columns, fields, defaults }: {
  title: string; endpoint: string; columns: Column<T>[]; fields: Field[]; defaults: Record<string, unknown>;
}) {
  const [rows, setRows] = useState<T[]>([]);
  const [form, setForm] = useState<Record<string, unknown>>(defaults);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => api<T[]>(endpoint).then(setRows).catch((e) => setErr(errMsg(e))), [endpoint]);
  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const v = form[f.key];
      body[f.key] = f.type === 'number' ? Number(v) : f.nullable && (v === '' || v === undefined) ? null : v;
    }
    try { editing ? await put(`${endpoint}/${editing}`, body) : await post(endpoint, body); setForm(defaults); setEditing(null); load(); }
    catch (e) { setErr(errMsg(e)); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="col-span-full font-semibold">{editing ? `Edit ${title}` : `Add ${title}`}</h2>
        {fields.map((f) => (
          <label key={f.key} className="text-sm">{f.label}
            {f.type === 'select' ? (
              <select className="input mt-1" value={String(form[f.key] ?? '')} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} required={f.required}>
                {f.nullable && <option value="">—</option>}
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === 'days' ? (
              <div className="mt-1 flex flex-wrap gap-2">{DAYS.map((d, i) => {
                const cur = (form[f.key] as number[]) ?? [];
                return <label key={d} className="text-xs"><input type="checkbox" checked={cur.includes(i)} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked ? [...cur, i].sort() : cur.filter((x) => x !== i) })} /> {d}</label>;
              })}</div>
            ) : f.type === 'checkbox' ? (
              <input type="checkbox" className="ml-2" checked={Boolean(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />
            ) : (
              <input className="input mt-1" type={f.type} value={String(form[f.key] ?? '')} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} required={f.required} />
            )}
          </label>
        ))}
        <div className="col-span-full flex items-center gap-2">
          <button className="btn">{editing ? 'Save' : 'Create'}</button>
          {editing && <button type="button" className="btn-ghost" onClick={() => { setEditing(null); setForm(defaults); }}>Cancel</button>}
          {err && <span className="text-sm text-red-600">{err}</span>}
        </div>
      </form>

      <div className="card overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500"><tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}<th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} className="border-t">
            {columns.map((c) => <td key={c.label} className="py-1.5">{c.render(r)}</td>)}
            <td className="space-x-2 text-right">
              <button className="text-blue-700" onClick={() => { setEditing(r.id); setForm({ ...defaults, ...(r as Record<string, unknown>) }); }}>edit</button>
              <button className="text-red-600" onClick={() => confirm('Delete?') && del(`${endpoint}/${r.id}`).then(load).catch((e) => setErr(errMsg(e)))}>delete</button>
            </td></tr>
        ))}</tbody></table></div>
    </div>
  );
}
