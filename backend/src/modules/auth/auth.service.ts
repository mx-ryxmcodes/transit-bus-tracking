import { PrismaClient, Role as DbRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import type { Role } from '@shared/rbac';

export const prisma = new PrismaClient();
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export class AuthError extends Error {
  constructor(public code: string, public status = 401) { super(code); }
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
// Pre-computed hash so unknown-email logins cost the same as real ones (timing-attack mitigation).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

export function signAccess(userId: string, role: Role) {
  return jwt.sign({ sub: userId, role }, env.JWT_SECRET, { expiresIn: `${env.ACCESS_TTL_MIN}m` });
}

/** Creates an opaque refresh token; only its hash is stored (DB leak != session leak). */
export async function issueRefresh(userId: string) {
  const raw = crypto.randomBytes(48).toString('base64url');
  await prisma.refreshToken.create({
    data: { userId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 864e5) },
  });
  return raw;
}

export async function issueSession(user: { id: string; role: DbRole }) {
  return { access: signAccess(user.id, user.role as Role), refresh: await issueRefresh(user.id) };
}

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.isActive) throw new AuthError('INVALID_CREDENTIALS');
  return user;
}

/** Rotation: old token is revoked on every use; reuse of a revoked token kills all sessions. */
export async function rotateRefresh(raw: string) {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
  if (!row) throw new AuthError('INVALID_REFRESH');
  if (row.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw new AuthError('REFRESH_REUSE_DETECTED');
  }
  if (row.expiresAt < new Date() || !row.user.isActive) throw new AuthError('INVALID_REFRESH');
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  return issueSession(row.user);
}

export async function revokeRefresh(raw: string) {
  await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Driver device check: unknown devices are registered UNTRUSTED; operator must approve. */
export async function assertTrustedDevice(userId: string, fingerprint: string) {
  const profile = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!profile) throw new AuthError('NOT_A_DRIVER', 403);
  const device = await prisma.driverDevice.upsert({
    where: { driverId_fingerprint: { driverId: profile.id, fingerprint } },
    update: { lastSeenAt: new Date() },
    create: { driverId: profile.id, fingerprint, lastSeenAt: new Date() },
  });
  if (!device.isTrusted) throw new AuthError('DEVICE_PENDING_APPROVAL', 403);
  return device;
}
