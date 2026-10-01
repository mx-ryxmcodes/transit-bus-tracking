import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;
export function getSocket(): Socket {
  if (!socket) socket = io(process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000', { withCredentials: true });
  return socket;
}
/** After /api/auth/refresh, reconnect so the handshake carries the new access cookie. */
export function reconnectSocket() {
  const s = getSocket();
  s.disconnect();
  s.connect();
}
