import 'dotenv/config';
import 'express-async-errors'; // Express 4: route async errors to the error handler instead of crashing
import http from 'http';
import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { env } from './config/env';
import { optionalAuth } from './middleware/auth';
import { HttpError } from './lib/errors';
import authRoutes from './modules/auth/auth.routes';
import operatorRoutes from './modules/operator/operator.routes';
import catalogRoutes from './modules/operator/catalog.routes';
import opsRoutes from './modules/operator/ops.routes';
import driverRoutes from './modules/driver/driver.routes';
import publicRoutes from './modules/public/public.routes';
import { AuthError } from './modules/auth/auth.service';
import { initRealtime } from './realtime/gateway';
import { rehydrateActiveTrips, startWatchdog } from './modules/tracking/tracking.service';

export const app = express();
app.set('trust proxy', 1); // behind Nginx
app.use(helmet(), express.json({ limit: '100kb' }), cookieParser(), optionalAuth);

app.use('/api', rateLimit({ windowMs: 60e3, limit: 600 }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60e3, limit: 20 }));
app.use('/api/auth/driver/login', rateLimit({ windowMs: 15 * 60e3, limit: 20 }));

app.use('/api/auth', authRoutes);
app.use('/api/operator', operatorRoutes);
app.use('/api/operator', catalogRoutes);
app.use('/api/operator', opsRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api', publicRoutes);

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: 'VALIDATION', details: err.flatten() });
  if (err instanceof HttpError || err instanceof AuthError) return res.status(err.status).json({ error: err.code });
  if (err?.code === 'P2025') return res.status(404).json({ error: 'NOT_FOUND' });
  if (err?.code === 'P2002') return res.status(409).json({ error: 'DUPLICATE' });
  if (err?.code === 'P2003') return res.status(409).json({ error: 'IN_USE' }); // FK: still referenced (trips etc.)
  console.error(err);
  res.status(500).json({ error: 'INTERNAL' });
};
app.use(onError);

async function main() {
  await rehydrateActiveTrips();
  startWatchdog();
  const server = http.createServer(app);
  initRealtime(server);
  server.listen(env.PORT, () => console.log(`API + realtime on :${env.PORT}`));
}
main().catch((e) => { console.error(e); process.exit(1); });
