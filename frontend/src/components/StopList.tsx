import type { StopDto, StopEta } from '@/lib/types';

/** Stop sequence with per-stop ETA; highlights the approaching stop and any alert-impacted stop. */
export default function StopList({ stops, etas, impactedStopIds = [] }: { stops: StopDto[]; etas: StopEta[]; impactedStopIds?: string[] }) {
  const byId = new Map(etas.map((e) => [e.stopId, e]));
  const next = etas.filter((e) => e.status !== 'Passed' && e.etaMins !== null).sort((a, b) => a.stopOrder - b.stopOrder)[0]?.stopId;
  return (
    <ol className="divide-y text-sm">
      {stops.map((s) => {
        const e = byId.get(s.id);
        const passed = e?.status === 'Passed';
        return (
          <li key={s.id} className={`flex items-center gap-3 py-2 ${passed ? 'text-slate-400' : ''} ${s.id === next ? 'bg-blue-50 font-semibold' : ''}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${passed ? 'bg-slate-200' : 'bg-blue-600 text-white'}`}>{s.order}</span>
            <span className="flex-1">{s.name}{impactedStopIds.includes(s.id) && <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-700">⚠ alert</span>}{s.id === next && <span className="ml-2 text-xs text-blue-700">approaching</span>}</span>
            <span className="w-24 text-right">
              {!e ? '—' : passed ? 'passed' : e.etaMins === null ? '—' : <span className={e.status === 'Delayed' ? 'text-red-600' : 'text-emerald-700'}>{e.etaMins} min · {e.status}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
