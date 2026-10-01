/** Operator: driver provisioning, device approval, driver↔bus assignment (updated from Phase 1: per-route permission). */
import { Router } from 'express';
import { z } from 'zod';
import { Permission, Role } from '@shared/rbac';
import { requirePermission } from '../../middleware/auth';
import { hashPassword, prisma } from '../auth/auth.service';

const r = Router();
const guard = requirePermission(Permission.DRIVER_MANAGE);

r.post('/drivers', guard, async (req, res, next) => {
  try {
    const b = z.object({
      email: z.string().email(), fullName: z.string().min(2), password: z.string().min(8),
      licenseNumber: z.string().min(4), phone: z.string().optional(), assignedBusId: z.string().uuid().optional(),
    }).parse(req.body);
    const user = await prisma.user.create({
      data: {
        email: b.email.toLowerCase(), fullName: b.fullName, passwordHash: await hashPassword(b.password), role: Role.DRIVER,
        driverProfile: { create: { licenseNumber: b.licenseNumber, phone: b.phone, assignedBusId: b.assignedBusId } },
      },
      include: { driverProfile: true },
    });
    res.status(201).json({ id: user.id, driverProfileId: user.driverProfile!.id });
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'DUPLICATE' });
    next(e);
  }
});

r.get('/drivers', guard, async (_req, res) => {
  const drivers = await prisma.driverProfile.findMany({
    include: { user: { select: { email: true, fullName: true, isActive: true } }, devices: true, assignedBus: { select: { id: true, busNumber: true } } },
    orderBy: { licenseNumber: 'asc' },
  });
  res.json({ drivers });
});

/** Assign (or clear) the bus a driver is allowed to start trips with. */
r.patch('/drivers/:id/assign-bus', guard, async (req, res, next) => {
  try {
    const { busId } = z.object({ busId: z.string().uuid().nullable() }).parse(req.body);
    await prisma.driverProfile.update({ where: { id: req.params.id }, data: { assignedBusId: busId } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.patch('/users/:id/active', guard, async (req, res, next) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    await prisma.user.update({ where: { id: req.params.id }, data: { isActive } });
    if (!isActive) await prisma.refreshToken.updateMany({ where: { userId: req.params.id, revokedAt: null }, data: { revokedAt: new Date() } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** Untrusting a device also revokes the driver's refresh tokens so the session dies within one access-token lifetime. */
r.patch('/devices/:id/trust', guard, async (req, res, next) => {
  try {
    const { isTrusted } = z.object({ isTrusted: z.boolean() }).parse(req.body);
    const d = await prisma.driverDevice.update({ where: { id: req.params.id }, data: { isTrusted }, include: { driver: true } });
    if (!isTrusted) await prisma.refreshToken.updateMany({ where: { userId: d.driver.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
