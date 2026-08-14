import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { ok } from '../utils/respond.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';

async function upsertFcmToken(deviceObjectId, token) {
  if (!token) return;
  // A token is globally unique; move it to this device and mark active.
  await prisma.fcmToken.upsert({
    where: { token },
    update: { deviceId: deviceObjectId, isActive: true },
    create: { deviceId: deviceObjectId, token, isActive: true },
  });
}

// POST /devices/register — none auth. Returns a device secret (plaintext once).
export const register = asyncHandler(async (req, res) => {
  const { deviceId, platform, appVersion, androidVersion, model, timezone, fcmToken } = req.body;

  const deviceSecret = crypto.randomBytes(32).toString('hex');
  const deviceSecretHash = await bcrypt.hash(deviceSecret, 10);

  const device = await prisma.device.upsert({
    where: { deviceId },
    update: {
      deviceSecretHash,
      platform: platform || 'android',
      appVersion,
      androidVersion,
      model,
      timezone,
      status: 'ACTIVE',
      lastActiveAt: new Date(),
    },
    create: {
      deviceId,
      deviceSecretHash,
      platform: platform || 'android',
      appVersion,
      androidVersion,
      model,
      timezone,
      status: 'ACTIVE',
      lastActiveAt: new Date(),
    },
  });

  await upsertFcmToken(device.id, fcmToken);

  return ok(res, { deviceId: device.deviceId, deviceSecret }, 201);
});

// PUT /devices/fcm-token — device auth.
export const updateFcmToken = asyncHandler(async (req, res) => {
  const { fcmToken } = req.body;
  await upsertFcmToken(req.device.id, fcmToken);
  return ok(res, { success: true });
});

// POST /devices/heartbeat — device auth. Updates activity → { currentVersion }.
export const heartbeat = asyncHandler(async (req, res) => {
  const { timezone, appVersion } = req.body;
  const now = new Date();

  await prisma.device.update({
    where: { id: req.device.id },
    data: {
      lastActiveAt: now,
      lastSyncAt: now,
      status: 'ACTIVE',
      ...(timezone ? { timezone } : {}),
      ...(appVersion ? { appVersion } : {}),
    },
  });

  const schedule = await prisma.prayerSchedule.findFirst({ select: { currentVersion: true } });
  return ok(res, { currentVersion: schedule?.currentVersion ?? 0 });
});

// GET /devices — admin list with derived status.
export const listDevices = asyncHandler(async (_req, res) => {
  const devices = await prisma.device.findMany({ orderBy: { lastActiveAt: 'desc' } });
  const thresholdMs = env.DEVICE_INACTIVE_MINUTES * 60_000;
  const now = Date.now();

  const items = devices.map((d) => ({
    deviceId: d.deviceId,
    platform: d.platform,
    model: d.model,
    appVersion: d.appVersion,
    androidVersion: d.androidVersion,
    timezone: d.timezone,
    status:
      d.lastActiveAt && now - new Date(d.lastActiveAt).getTime() <= thresholdMs
        ? 'ACTIVE'
        : 'INACTIVE',
    lastSyncAt: d.lastSyncAt,
    lastActiveAt: d.lastActiveAt,
    createdAt: d.createdAt,
  }));
  return ok(res, { devices: items });
});
