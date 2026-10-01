/** Socket.IO gateway. Auth comes from the same httpOnly `at` cookie as the REST API (anonymous = public viewer). */
import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { parse } from 'cookie';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Permission, hasPermission } from '@shared/rbac';
import { WS } from '@shared/events';
import type { AuthClaims } from '../middleware/auth';
import { setIO } from './io';
import { activeTrips, getSnapshot, ingestPing } from '../modules/tracking/tracking.service';

type Ack = (r: unknown) => void;

export function initRealtime(http: HttpServer) {
  const io = new Server(http, { cors: { origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true } });
  setIO(io);

  io.use((socket, next) => {
    socket.data.auth = null;
    const raw = parse(socket.handshake.headers.cookie ?? '').at;
    if (raw) { try { socket.data.auth = jwt.verify(raw, env.JWT_SECRET) as AuthClaims; } catch { /* anonymous */ } }
    next();
  });

  io.on('connection', (socket) => {
    const auth = socket.data.auth as AuthClaims | null;
    const role = auth?.role ?? null;

    socket.on(WS.SUB_ROUTE, (p: { routeId?: string }, ack?: Ack) => {
      if (!hasPermission(role, Permission.TRACKING_VIEW) || typeof p?.routeId !== 'string') return ack?.({ ok: false });
      socket.join(`route:${p.routeId}`);
      const snapshots = [...activeTrips.values()].filter((a) => a.routeId === p.routeId).map((a) => ({ tripId: a.id, busId: a.busId, ...getSnapshot(a.id) }));
      ack?.({ ok: true, snapshots });
    });

    socket.on(WS.SUB_TRIP, (p: { tripId?: string }, ack?: Ack) => {
      if (!hasPermission(role, Permission.TRACKING_VIEW) || typeof p?.tripId !== 'string') return ack?.({ ok: false });
      socket.join(`trip:${p.tripId}`);
      ack?.({ ok: true, ...getSnapshot(p.tripId) });
    });

    socket.on(WS.SUB_FLEET, (_p: unknown, ack?: Ack) => {
      if (!hasPermission(role, Permission.FLEET_MONITOR)) return ack?.({ ok: false, error: 'FORBIDDEN_PERMISSION' });
      socket.join('fleet');
      ack?.({ ok: true });
    });

    // Driver GPS telemetry
    socket.on(WS.GPS_PING, (p: { tripId?: string; lat?: number; lng?: number; speedKmh?: number; ts?: number }, ack?: Ack) => {
      if (!auth || !hasPermission(auth.role, Permission.GPS_STREAM)) return ack?.({ ok: false, error: 'FORBIDDEN_PERMISSION' });
      if (auth.exp && auth.exp * 1000 < Date.now()) return ack?.({ ok: false, error: 'TOKEN_EXPIRED' }); // client refreshes + reconnects
      if (typeof p?.tripId !== 'string') return ack?.({ ok: false, error: 'INVALID_PAYLOAD' });
      ack?.(ingestPing(p.tripId, { lat: Number(p.lat), lng: Number(p.lng), speedKmh: p.speedKmh === undefined ? undefined : Number(p.speedKmh), ts: p.ts === undefined ? undefined : Number(p.ts) }, 'DEVICE', auth.sub));
    });
  });
}
