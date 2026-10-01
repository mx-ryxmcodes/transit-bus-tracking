'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import ResourceManager from '@/components/admin/ResourceManager';
import RoutesAdmin from '@/components/admin/RoutesAdmin';
import DriversAdmin from '@/components/admin/DriversAdmin';

const TABS = ['Buses', 'Routes', 'Drivers', 'Schedules'] as const;
const STATUSES = ['AVAILABLE', 'ON_ROUTE', 'DELAYED', 'BREAK', 'OFFLINE'].map((s) => ({ value: s, label: s }));
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Bus { id: string; busNumber: string; vehicleNumber: string; capacity: number; status: string; currentRoute: { routeName: string } | null }
interface Sched { id: string; departureTime: string; daysOfWeek: number[]; isActive: boolean; route: { routeName: string }; bus: { busNumber: string } | null }

export default function ManagePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Buses');
  const [routes, setRoutes] = useState<{ value: string; label: string }[]>([]);
  const [buses, setBuses] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    api<{ id: string; routeName: string }[]>('/operator/routes').then((r) => setRoutes(r.map((x) => ({ value: x.id, label: x.routeName })))).catch(() => {});
    api<Bus[]>('/operator/buses').then((r) => setBuses(r.map((x) => ({ value: x.id, label: `Bus ${x.busNumber}` })))).catch(() => {});
  }, [tab]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">{TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={tab === t ? 'btn' : 'btn-ghost'}>{t}</button>)}</div>
      {tab === 'Buses' && (
        <ResourceManager<Bus> title="bus" endpoint="/operator/buses" defaults={{ busNumber: '', vehicleNumber: '', capacity: 40, status: 'AVAILABLE', currentRouteId: '' }}
          fields={[
            { key: 'busNumber', label: 'Bus number', type: 'text', required: true }, { key: 'vehicleNumber', label: 'Vehicle number', type: 'text', required: true },
            { key: 'capacity', label: 'Capacity', type: 'number', required: true },
            { key: 'currentRouteId', label: 'Assigned route', type: 'select', options: routes, nullable: true },
            { key: 'status', label: 'Status', type: 'select', options: STATUSES },
          ]}
          columns={[{ label: 'Bus', render: (b) => b.busNumber }, { label: 'Vehicle', render: (b) => b.vehicleNumber }, { label: 'Capacity', render: (b) => b.capacity }, { label: 'Status', render: (b) => b.status }, { label: 'Route', render: (b) => b.currentRoute?.routeName ?? '—' }]} />
      )}
      {tab === 'Routes' && <RoutesAdmin />}
      {tab === 'Drivers' && <DriversAdmin />}
      {tab === 'Schedules' && (
        <ResourceManager<Sched> title="schedule" endpoint="/operator/schedules" defaults={{ routeId: '', busId: '', departureTime: '08:00', daysOfWeek: [1, 2, 3, 4, 5], isActive: true }}
          fields={[
            { key: 'routeId', label: 'Route', type: 'select', options: routes, required: true },
            { key: 'busId', label: 'Bus (optional)', type: 'select', options: buses, nullable: true },
            { key: 'departureTime', label: 'Departure (HH:mm)', type: 'text', required: true },
            { key: 'daysOfWeek', label: 'Days', type: 'days' }, { key: 'isActive', label: 'Active', type: 'checkbox' },
          ]}
          columns={[{ label: 'Route', render: (s) => s.route.routeName }, { label: 'Bus', render: (s) => s.bus?.busNumber ?? '—' }, { label: 'Departs', render: (s) => s.departureTime }, { label: 'Days', render: (s) => s.daysOfWeek.map((d) => DAY[d]).join(' ') }, { label: 'Active', render: (s) => (s.isActive ? 'yes' : 'no') }]} />
      )}
    </div>
  );
}
