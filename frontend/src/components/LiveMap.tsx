'use client';
// Leaflet map (OpenStreetMap tiles, no API key). Import with next/dynamic { ssr: false }.
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';

export interface MapStop { id: string; name: string; lat: number; lng: number; highlight?: boolean }
export interface MapBus { id: string; label: string; lat: number; lng: number; simulated?: boolean; delayed?: boolean; lost?: boolean; idle?: boolean }
export interface MapRoute { id: string; stops: MapStop[]; color?: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const busIcon = (b: MapBus) =>
  L.divIcon({
    className: 'bus-marker',
    html: `<div style="background:${b.lost || b.idle ? '#6b7280' : b.delayed ? '#dc2626' : '#2563eb'};color:#fff;border-radius:9999px;padding:2px 8px;font:600 12px system-ui;white-space:nowrap;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">🚌 ${esc(b.label)}${b.simulated ? ' · SIM' : ''}${b.lost ? ' · NO GPS' : ''}</div>`,
    iconSize: [90, 24], iconAnchor: [45, 12],
  });

function Fit({ points, fitKey }: { points: [number, number][]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}

export default function LiveMap({ routes = [], buses = [], height = 420 }: { routes?: MapRoute[]; buses?: MapBus[]; height?: number }) {
  const all: [number, number][] = routes.flatMap((r) => r.stops.map((s) => [s.lat, s.lng] as [number, number]));
  const fitKey = routes.map((r) => `${r.id}:${r.stops.length}`).join('|') || (buses.length ? 'buses' : 'none');
  const pts = all.length ? all : buses.map((b) => [b.lat, b.lng] as [number, number]);
  return (
    <MapContainer center={pts[0] ?? [25.4, 68.33]} zoom={12} style={{ height, width: '100%', borderRadius: 8 }} scrollWheelZoom>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Fit points={pts} fitKey={fitKey} />
      {routes.map((r) => (
        <Polyline key={r.id} positions={r.stops.map((s) => [s.lat, s.lng] as [number, number])} pathOptions={{ color: r.color ?? '#2563eb', weight: 4, opacity: 0.6 }} />
      ))}
      {routes.flatMap((r) => r.stops.map((s) => (
        <CircleMarker key={`${r.id}-${s.id}`} center={[s.lat, s.lng]} radius={s.highlight ? 8 : 5}
          pathOptions={{ color: s.highlight ? '#dc2626' : '#1e3a8a', fillColor: s.highlight ? '#fecaca' : '#fff', fillOpacity: 1, weight: 2 }}>
          <Tooltip>{s.name}</Tooltip>
        </CircleMarker>
      )))}
      {buses.map((b) => <Marker key={b.id} position={[b.lat, b.lng]} icon={busIcon(b)} />)}
    </MapContainer>
  );
}
