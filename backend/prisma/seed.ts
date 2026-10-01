// Bootstrap the first operator: SEED_OPERATOR_EMAIL=... SEED_OPERATOR_PASSWORD=... npm run seed
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
(async () => {
  const email = process.env.SEED_OPERATOR_EMAIL?.toLowerCase(), pw = process.env.SEED_OPERATOR_PASSWORD;
  if (!email || !pw) throw new Error('Set SEED_OPERATOR_EMAIL and SEED_OPERATOR_PASSWORD');
  await prisma.user.upsert({
    where: { email }, update: {},
    create: { email, fullName: 'Fleet Operator', passwordHash: await bcrypt.hash(pw, 12), role: 'ROLE_OPERATOR' },
  });
  console.log('Operator ready:', email);
})().finally(() => prisma.$disconnect());
