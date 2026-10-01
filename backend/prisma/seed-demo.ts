/**
 * Demo data matching the spec: Route 05 (City Center -> University Gate), Bus 14, Driver 08,
 * plus Route 03 / Route 09 to demonstrate transfers (Route 03 -> City Center -> Route 09).
 * Coordinates are APPROXIMATE placeholders around Hyderabad–Jamshoro — replace with surveyed stops for real use.
 *
 *   SEED_DRIVER_PASSWORD='...' [SEED_DEMO_DEVICE_FINGERPRINT='<id shown on driver login>'] npm run seed:demo
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

const s = (stopName: string, latitude: number, longitude: number) => ({ stopName, latitude, longitude });

const ROUTES: Record<string, { duration: number; stops: ReturnType<typeof s>[] }> = {
  'Route 05': { duration: 28, stops: [
    s('City Center', 25.3960, 68.3680), s('Station Road', 25.3990, 68.3560), s('Latifabad Unit 7', 25.4005, 68.3440),
    s('Bypass Chowk', 25.4040, 68.3320), s('Hyderabad Bypass', 25.4075, 68.3190), s('Indus Highway Flyover', 25.4110, 68.3050),
    s('Stop 7 - Kotri Link', 25.4150, 68.2920), s('Jamshoro Bus Stop', 25.4185, 68.2780), s('University Gate', 25.4217, 68.2640),
  ] },
  'Route 03': { duration: 15, stops: [
    s('Cantonment', 25.3700, 68.3900), s('Airport Road', 25.3780, 68.3830), s('Fatima Chowk', 25.3870, 68.3760), s('City Center', 25.3960, 68.3680),
  ] },
  'Route 09': { duration: 14, stops: [
    s('City Center', 25.3960, 68.3680), s('Hirabad', 25.4020, 68.3620), s('Qasimabad Market', 25.4110, 68.3540), s('Qasimabad Gate', 25.4200, 68.3470),
  ] },
};

(async () => {
  const routeIds: Record<string, string> = {};
  for (const [name, def] of Object.entries(ROUTES)) {
    const existing = await prisma.route.findUnique({ where: { routeName: name } });
    if (existing) { routeIds[name] = existing.id; continue; }
    const r = await prisma.route.create({
      data: {
        routeName: name, startLocation: def.stops[0].stopName, destination: def.stops.at(-1)!.stopName,
        estimatedDurationMins: def.duration, totalStops: def.stops.length,
        stops: { create: def.stops.map((x, i) => ({ ...x, stopOrder: i + 1 })) },
      },
    });
    routeIds[name] = r.id;
  }

  // Bus 14 parked ~2.9 km (road-adjusted) from City Center => idle ETA ≈ 7 min in the demo
  const bus14 = await prisma.bus.upsert({
    where: { busNumber: '14' }, update: {},
    create: { busNumber: '14', vehicleNumber: 'SND-0014', capacity: 45, currentRouteId: routeIds['Route 05'], lastLat: 25.3760, lastLng: 68.3680 },
  });
  await prisma.bus.upsert({ where: { busNumber: '21' }, update: {}, create: { busNumber: '21', vehicleNumber: 'SND-0021', capacity: 40, currentRouteId: routeIds['Route 03'], lastLat: 25.3700, lastLng: 68.3900 } });
  await prisma.bus.upsert({ where: { busNumber: '33' }, update: {}, create: { busNumber: '33', vehicleNumber: 'SND-0033', capacity: 40, currentRouteId: routeIds['Route 09'], lastLat: 25.3960, lastLng: 68.3680 } });

  const pw = process.env.SEED_DRIVER_PASSWORD;
  if (!pw) throw new Error('Set SEED_DRIVER_PASSWORD');
  const user = await prisma.user.upsert({
    where: { email: 'driver08@example.com' }, update: {},
    create: {
      email: 'driver08@example.com', fullName: 'Driver 08', passwordHash: await bcrypt.hash(pw, 12), role: 'ROLE_DRIVER',
      driverProfile: { create: { licenseNumber: 'LIC-0008', assignedBusId: bus14.id } },
    },
    include: { driverProfile: true },
  });
  const profile = await prisma.driverProfile.findUniqueOrThrow({ where: { userId: user.id } });

  const fp = process.env.SEED_DEMO_DEVICE_FINGERPRINT;
  if (fp) {
    await prisma.driverDevice.upsert({
      where: { driverId_fingerprint: { driverId: profile.id, fingerprint: fp } },
      update: { isTrusted: true }, create: { driverId: profile.id, fingerprint: fp, isTrusted: true, label: 'Demo phone' },
    });
    console.log('Trusted demo device registered.');
  }
  console.log('Demo data ready. Driver login: driver08@example.com');
})().finally(() => prisma.$disconnect());
