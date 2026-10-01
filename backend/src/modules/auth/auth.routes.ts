import { Router, type Response } from 'express';
import { z } from 'zod';
import { Role } from '@shared/rbac';
import { env } from '../../config/env';
import { requireAuth } from '../../middleware/auth';
import * as svc from './auth.service';

const r = Router();
const secure = env.NODE_ENV === 'production';

function setCookies(res: Response, s: { access: string; refresh: string }) {
  res.cookie('at', s.access, { httpOnly: true, secure, sameSite: 'lax', maxAge: env.ACCESS_TTL_MIN * 60e3, path: '/' });
  res.cookie('rt', s.refresh, { httpOnly: true, secure, sameSite: 'lax', maxAge: env.REFRESH_TTL_DAYS * 864e5, path: '/api/auth' });
}
const clearCookies = (res: Response) => { res.clearCookie('at', { path: '/' }); res.clearCookie('rt', { path: '/api/auth' }); };
const publicUser = (u: any) => ({ id: u.id, email: u.email, fullName: u.fullName, role: u.role });

const creds = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });

/** Self-registration ALWAYS creates a PASSENGER. Role is never taken from the request body. */
r.post('/register', async (req, res, next) => {
  try {
    const body = creds.extend({ fullName: z.string().min(2).max(80) }).parse(req.body);
    const user = await svc.prisma.user.create({
      data: { email: body.email.toLowerCase(), fullName: body.fullName, passwordHash: await svc.hashPassword(body.password), role: Role.PASSENGER },
    });
    setCookies(res, await svc.issueSession(user));
    res.status(201).json({ user: publicUser(user) });
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'EMAIL_TAKEN' });
    next(e);
  }
});

/** Generic login (passenger / operator). Drivers must use /driver/login. */
r.post('/login', async (req, res, next) => {
  try {
    const { email, password } = creds.parse(req.body);
    const user = await svc.verifyCredentials(email, password);
    if (user.role === Role.DRIVER) throw new svc.AuthError('USE_DRIVER_LOGIN', 403);
    setCookies(res, await svc.issueSession(user));
    res.json({ user: publicUser(user) });
  } catch (e) { next(e); }
});

/** Driver login requires a trusted device fingerprint. */
r.post('/driver/login', async (req, res, next) => {
  try {
    const { email, password, deviceFingerprint } = creds.extend({ deviceFingerprint: z.string().min(16).max(128) }).parse(req.body);
    const user = await svc.verifyCredentials(email, password);
    if (user.role !== Role.DRIVER) throw new svc.AuthError('NOT_A_DRIVER', 403);
    await svc.assertTrustedDevice(user.id, deviceFingerprint);
    setCookies(res, await svc.issueSession(user));
    res.json({ user: publicUser(user) });
  } catch (e) { next(e); }
});

r.post('/refresh', async (req, res, next) => {
  try {
    const raw = req.cookies?.rt;
    if (!raw) throw new svc.AuthError('NO_REFRESH');
    setCookies(res, await svc.rotateRefresh(raw));
    res.json({ ok: true });
  } catch (e) { clearCookies(res); next(e); }
});

r.post('/logout', async (req, res) => {
  if (req.cookies?.rt) await svc.revokeRefresh(req.cookies.rt);
  clearCookies(res);
  res.json({ ok: true });
});

r.get('/me', requireAuth, async (req, res) => {
  const user = await svc.prisma.user.findUnique({ where: { id: req.auth!.sub } });
  if (!user || !user.isActive) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  res.json({ user: publicUser(user) });
});

export default r;
