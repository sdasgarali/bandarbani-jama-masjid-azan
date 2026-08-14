import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, Prayer } from '@prisma/client';

const prisma = new PrismaClient();

const EXAMPLE_TIMES = {
  [Prayer.FAJR]: '04:18',
  [Prayer.DHUHR]: '12:05',
  [Prayer.ASR]: '16:38',
  [Prayer.MAGHRIB]: '18:21',
  [Prayer.ISHA]: '19:42',
};

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, name: 'Administrator', role: 'admin' },
  });
  console.log(`Seeded admin: ${admin.email}`);

  // One schedule (MVP: single active schedule).
  let schedule = await prisma.prayerSchedule.findFirst();
  if (!schedule) {
    schedule = await prisma.prayerSchedule.create({
      data: {
        name: 'Bandarbani Jama Masjid',
        timezone: 'Asia/Dhaka',
        currentVersion: 0,
        isPublished: false,
      },
    });
    console.log(`Seeded schedule: ${schedule.name}`);
  } else {
    console.log(`Schedule already exists: ${schedule.name}`);
  }

  for (const prayer of Object.values(Prayer)) {
    await prisma.prayerTime.upsert({
      where: { scheduleId_prayer: { scheduleId: schedule.id, prayer } },
      update: {},
      create: {
        scheduleId: schedule.id,
        prayer,
        time: EXAMPLE_TIMES[prayer],
        enabled: true,
        audioEnabled: true,
        notificationEnabled: true,
      },
    });
  }
  console.log('Seeded 5 prayer times (Fajr..Isha).');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
