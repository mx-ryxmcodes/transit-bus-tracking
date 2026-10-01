// Run: npm test   (node:test via tsx)
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeEtaMins } from './eta.service';
import { alongRouteKm, haversineKm } from '../../lib/geo';

const offPeak = new Date('2026-01-01T20:00:00Z'); // 01:00 Karachi => multiplier 1.0

test('ETA = base + delay (off-peak)', () => {
  // 5 km @ 40 km/h = 7.5 -> 8 min ; +15 delay = 23
  assert.equal(computeEtaMins(5, 40, 0, offPeak), 8);
  assert.equal(computeEtaMins(5, 40, 15, offPeak), 23);
});

test('speed clamp avoids huge ETAs when stopped', () => {
  assert.equal(computeEtaMins(1, 0, 0, offPeak), 3); // default 25 km/h => 2.4 -> 3
  assert.equal(computeEtaMins(1, 1, 0, offPeak), 6); // clamped to 10 km/h
});

test('alongRouteKm: ahead, at, and passed stops', () => {
  const pts = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }, { lat: 0, lng: 0.02 }];
  const mid = { lat: 0, lng: 0.005 };
  const toStop1 = alongRouteKm(mid, pts, 1)!;
  assert.ok(Math.abs(toStop1 - haversineKm(mid, pts[1])) < 0.01);
  assert.equal(alongRouteKm(mid, pts, 0), null);          // already passed
  assert.equal(alongRouteKm(pts[1], pts, 1), 0);          // standing at stop
});
