import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { hasPermission, type Permission, type Role } from '@shared/rbac';

export interface AuthClaims { sub: string; role: Role; exp?: number }
declare module 'express-serve-static-core' {
  interface Request { auth?: AuthClaims }
}

function readToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return (req as any).cookies?.at ?? null;
}

/** Attaches req.auth if a valid token exists; never rejects. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (token) {
    try { req.auth = jwt.verify(token, env.JWT_SECRET) as AuthClaims; } catch { /* anonymous */ }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  optionalAuth(req, res, () => {
    if (!req.auth) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    next();
  });
}

export const requireRole = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) =>
  requireAuth(req, res, () =>
    roles.includes(req.auth!.role) ? next() : res.status(403).json({ error: 'FORBIDDEN_ROLE' }));

export const requirePermission = (...perms: Permission[]) => (req: Request, res: Response, next: NextFunction) =>
  requireAuth(req, res, () =>
    perms.every((p) => hasPermission(req.auth!.role, p)) ? next() : res.status(403).json({ error: 'FORBIDDEN_PERMISSION' }));

/** Like requirePermission but ALSO works for anonymous visitors (public permissions). */
export const allow = (...perms: Permission[]) => (req: Request, res: Response, next: NextFunction) =>
  perms.every((p) => hasPermission(req.auth?.role, p))
    ? next()
    : res.status(req.auth ? 403 : 401).json({ error: req.auth ? 'FORBIDDEN_PERMISSION' : 'UNAUTHENTICATED' });
