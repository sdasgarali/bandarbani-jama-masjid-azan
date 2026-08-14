import { jest } from '@jest/globals';
import bcrypt from 'bcryptjs';
import { createMemoryPrisma } from './memoryPrisma.js';

// jest.unstable_mockModule resolves specifiers relative to the *test file*
// (which lives in tests/), so these are one level up to src/.
const prismaMockSpecifier = '../src/config/prisma.js';
const fcmMockSpecifier = '../src/services/fcm.js';
// The dynamic import() below is resolved relative to THIS file (tests/helpers/),
// so it needs two levels up.
const appImportSpecifier = '../../src/app.js';

/**
 * Build the Express app with Prisma and Firebase mocked. Returns { app, prisma, fcm }.
 * Uses jest.unstable_mockModule so the app's static imports resolve to the mocks.
 */
export async function buildTestApp() {
  const prisma = createMemoryPrisma();

  const fcm = {
    sendData: jest.fn().mockResolvedValue({ enabled: false, sent: 0, failed: 0, tokens: 0 }),
    sendScheduleUpdated: jest
      .fn()
      .mockResolvedValue({ enabled: false, sent: 0, failed: 0, tokens: 0 }),
    sendConfigUpdated: jest
      .fn()
      .mockResolvedValue({ enabled: false, sent: 0, failed: 0, tokens: 0 }),
    sendTestAzan: jest
      .fn()
      .mockResolvedValue({ enabled: false, sent: 0, failed: 0, tokens: 0 }),
    sendTestNotification: jest
      .fn()
      .mockResolvedValue({ enabled: false, sent: 0, failed: 0, tokens: 0 }),
    sendAppUpdateAvailable: jest
      .fn()
      .mockResolvedValue({ enabled: false, sent: 0, failed: 0, tokens: 0 }),
  };

  jest.unstable_mockModule(prismaMockSpecifier, () => ({
    prisma,
    default: prisma,
  }));

  jest.unstable_mockModule(fcmMockSpecifier, () => ({
    ...fcm,
    default: fcm,
  }));

  const { createApp } = await import(appImportSpecifier);
  const app = createApp();

  return { app, prisma, fcm };
}

// Seed one admin + one schedule + 5 prayers into the memory prisma.
export async function seedFixtures(prisma, { publish = false } = {}) {
  const passwordHash = await bcrypt.hash('Test1234!', 4);
  const admin = await prisma.admin.create({
    data: { email: 'admin@test.local', passwordHash, name: 'Admin', role: 'admin' },
  });

  const schedule = await prisma.prayerSchedule.create({
    data: {
      name: 'Test Masjid',
      timezone: 'Asia/Dhaka',
      currentVersion: 0,
      isPublished: false,
    },
  });

  const times = {
    FAJR: '04:18',
    DHUHR: '12:05',
    ASR: '16:38',
    MAGHRIB: '18:21',
    ISHA: '19:42',
  };
  for (const [prayer, time] of Object.entries(times)) {
    await prisma.prayerTime.create({
      data: {
        scheduleId: schedule.id,
        prayer,
        time,
        enabled: true,
        audioEnabled: true,
        notificationEnabled: true,
      },
    });
  }

  if (publish) {
    const payload = {
      version: 1,
      timezone: 'Asia/Dhaka',
      defaultAudioId: null,
      prayers: Object.entries(times).map(([prayer, time]) => ({
        prayer,
        time,
        enabled: true,
        audioEnabled: true,
        notificationEnabled: true,
        audioId: null,
      })),
      audios: [],
      announcements: [],
      publishedAt: new Date().toISOString(),
    };
    await prisma.scheduleVersion.create({
      data: {
        scheduleId: schedule.id,
        version: 1,
        timezone: 'Asia/Dhaka',
        payload,
        publishedById: admin.id,
        publishedAt: new Date(),
      },
    });
    await prisma.prayerSchedule.update({
      where: { id: schedule.id },
      data: { currentVersion: 1, isPublished: true },
    });
  }

  return { admin, schedule };
}

// Log in and return the access token.
export async function loginAndGetToken(request, app) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@test.local', password: 'Test1234!' });
  return res.body?.data?.accessToken;
}
