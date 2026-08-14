import { prisma } from '../config/prisma.js';
import { ok } from '../utils/respond.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { writeAudit } from '../services/audit.js';
import { sendTestNotification, sendTestAzan, sendConfigUpdated } from '../services/fcm.js';

// POST /admin/test-notification
export const testNotification = asyncHandler(async (req, res) => {
  const { deviceIds, title, body } = req.body;
  const fcm = await sendTestNotification(title, body, deviceIds);
  await writeAudit({
    adminId: req.admin.id,
    action: 'TEST_NOTIFICATION',
    entity: 'Fcm',
    metadata: { deviceIds: deviceIds ?? 'all', title, body, fcm },
    ip: req.ip,
  });
  return ok(res, { fcm });
});

// POST /admin/test-azan
export const testAzan = asyncHandler(async (req, res) => {
  const { deviceIds } = req.body;
  const fcm = await sendTestAzan(deviceIds);
  await writeAudit({
    adminId: req.admin.id,
    action: 'TEST_AZAN',
    entity: 'Fcm',
    metadata: { deviceIds: deviceIds ?? 'all', fcm },
    ip: req.ip,
  });
  return ok(res, { fcm });
});

// POST /admin/config — upsert key/value, then notify devices.
export const upsertConfig = asyncHandler(async (req, res) => {
  const { key, value } = req.body;
  const config = await prisma.appConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  await writeAudit({
    adminId: req.admin.id,
    action: 'CONFIG_UPSERT',
    entity: 'AppConfig',
    entityId: config.id,
    metadata: { key },
    ip: req.ip,
  });
  const fcm = await sendConfigUpdated();
  return ok(res, { key: config.key, value: config.value, updatedAt: config.updatedAt, fcm });
});

// GET /admin/config
export const listConfig = asyncHandler(async (_req, res) => {
  const items = await prisma.appConfig.findMany({ orderBy: { key: 'asc' } });
  return ok(res, {
    config: items.map((c) => ({ key: c.key, value: c.value, updatedAt: c.updatedAt })),
  });
});
