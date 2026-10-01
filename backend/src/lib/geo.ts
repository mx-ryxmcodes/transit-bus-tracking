export interface LatLng { lat: number; lng: number }
const R = 6371; // km
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length of a polyline in km. */
export function polylineKm(pts: LatLng[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += haversineKm(pts[i - 1], pts[i]);
  return s;
}

const toXY = (p: LatLng, lat0: number) => ({ x: rad(p.lng) * Math.cos(rad(lat0)) * R, y: rad(p.lat) * R });

export interface SegmentHit { index: number; t: number; offRouteKm: number }

/** Nearest polyline segment to p (local planar approximation; fine at city scale). */
export function nearestSegment(p: LatLng, pts: LatLng[]): SegmentHit {
  let best: SegmentHit = { index: 0, t: 0, offRouteKm: Infinity };
  const q = toXY(p, p.lat);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = toXY(pts[i], p.lat), b = toXY(pts[i + 1], p.lat);
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
    if (d < best.offRouteKm) best = { index: i, t, offRouteKm: d };
  }
  return best;
}

/**
 * Distance in km travelled ALONG the route from `pos` to stop #targetIdx (0-based).
 * Returns null when the bus has already passed that stop.
 */
export function alongRouteKm(pos: LatLng, pts: LatLng[], targetIdx: number): number | null {
  if (pts.length < 2) return null;
  const { index: i, t } = nearestSegment(pos, pts);
  if (targetIdx <= i) return targetIdx === i && t < 0.02 ? 0 : null;
  let d = (1 - t) * haversineKm(pts[i], pts[i + 1]);
  for (let k = i + 1; k < targetIdx; k++) d += haversineKm(pts[k], pts[k + 1]);
  return d;
}

/** Point located `km` along the polyline (used by the GPS simulator). */
export function pointAtKm(pts: LatLng[], km: number): LatLng {
  if (pts.length < 2) return pts[0];
  let rem = km;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = haversineKm(pts[i], pts[i + 1]);
    if (rem <= seg || i === pts.length - 2) {
      const f = seg === 0 ? 0 : Math.min(1, rem / seg);
      return { lat: pts[i].lat + (pts[i + 1].lat - pts[i].lat) * f, lng: pts[i].lng + (pts[i + 1].lng - pts[i].lng) * f };
    }
    rem -= seg;
  }
  return pts[pts.length - 1];
}
