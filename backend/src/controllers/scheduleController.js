import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { ok } from '../utils/respond.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getSchedule, buildPayload, sortPrayers } from '../services/schedule.js';
import { writeAudit } from '../services/audit.js';
import { sendScheduleUpdated } from '../services/fcm.js';

// GET /schedule — current draft + prayer times (admin).
export const getDraft = asyncHandler(async (_req, res) => {
  const schedule = await getSchedule();
  return ok(res, {
    id: schedule.id,
    name: schedule.name,
    timezone: schedule.timezone,
    currentVersion: schedule.currentVersion,
    isPublished: schedule.isPublished,
    prayers: schedule.prayers.map((p) => ({
      prayer: p.prayer,
      time: p.time,
      enabled: p.enabled,
      audioEnabled: p.audioEnabled,
      notificationEnabled: p.notificationEnabled,
    })),
    updatedAt: schedule.updatedAt,
  });
});

// PUT /schedule — update meta.
export const updateMeta = asyncHandler(async (req, res) => {
  const schedule = await getSchedule();
  const { timezone, name } = req.body;
  const updated = await prisma.prayerSchedule.update({
    where: { id: schedule.id },
    data: { timezone, ...(name ? { name } : {}) },
  });
  await writeAudit({
    adminId: req.admin.id,
    action: 'SCHEDULE_UPDATE_META',
    entity: 'PrayerSchedule',
    entityId: updated.id,
    metadata: { timezone, name },
    ip: req.ip,
  });
  return ok(res, { id: updated.id, name: updated.name, timezone: updated.timezone });
});

// PUT /schedule/prayers/:prayer — update one prayer.
export const updatePrayer = asyncHandler(async (req, res) => {
  const { prayer } = req.params;
  const schedule = await getSchedule();
  const existing = await prisma.prayerTime.findUnique({
    where: { scheduleId_prayer: { scheduleId: schedule.id, prayer } },
  });
  if (!existing) throw new AppError('NOT_FOUND', `Prayer ${prayer} not found`);

  const data = {};
  for (const key of ['time', 'enabled', 'audioEnabled', 'notificationEnabled']) {
    if (req.body[key] !== undefined) data[key] = req.body[key];
  }

  const updated = await prisma.prayerTime.update({
    where: { id: existing.id },
    data,
  });
  await writeAudit({
    adminId: req.admin.id,
    action: 'SCHEDULE_UPDATE_PRAYER',
    entity: 'PrayerTime',
    entityId: updated.id,
    metadata: { prayer, changes: data },
    ip: req.ip,
  });
  return ok(res, {
    prayer: updated.prayer,
    time: updated.time,
    enabled: updated.enabled,
    audioEnabled: updated.audioEnabled,
    notificationEnabled: updated.notificationEnabled,
  });
});

// POST /schedule/publish — snapshot → new ScheduleVersion, bump version, FCM fan-out.
export const publish = asyncHandler(async (req, res) => {
  const schedule = await getSchedule();
  const activeAudio = await prisma.azanAudio.findFirst({ where: { isActive: true } });

  const nextVersion = schedule.currentVersion + 1;
  const publishedAt = new Date();

  const payload = buildPayload({
    version: nextVersion,
    timezone: schedule.timezone,
    prayers: schedule.prayers,
    audio: activeAudio,
    publishedAt,
  });

  const version = await prisma.scheduleVersion.create({
    data: {
      scheduleId: schedule.id,
      version: nextVersion,
      timezone: schedule.timezone,
      payload,
      publishedById: req.admin.id,
      publishedAt,
    },
  });

  await prisma.prayerSchedule.update({
    where: { id: schedule.id },
    data: { currentVersion: nextVersion, isPublished: true },
  });

  await writeAudit({
    adminId: req.admin.id,
    action: 'SCHEDULE_PUBLISH',
    entity: 'ScheduleVersion',
    entityId: version.id,
    metadata: { version: nextVersion },
    ip: req.ip,
  });

  const fcm = await sendScheduleUpdated(nextVersion);

  return ok(res, { version: nextVersion, publishedAt: publishedAt.toISOString(), fcm }, 201);
});

// GET /schedule/versions — list published versions.
export const listVersions = asyncHandler(async (_req, res) => {
  const schedule = await getSchedule();
  const versions = await prisma.scheduleVersion.findMany({
    where: { scheduleId: schedule.id },
    orderBy: { version: 'desc' },
    select: { version: true, timezone: true, publishedAt: true, publishedById: true },
  });
  return ok(res, { versions });
});

// GET /schedule/current — latest published payload (device). ETag = version, 304 support.
export const getCurrent = asyncHandler(async (req, res) => {
  const schedule = await prisma.prayerSchedule.findFirst();
  if (!schedule || !schedule.isPublished || schedule.currentVersion < 1) {
    throw new AppError('NOT_FOUND', 'Schedule has never been published');
  }

  const latest = await prisma.scheduleVersion.findUnique({
    where: {
      scheduleId_version: { scheduleId: schedule.id, version: schedule.currentVersion },
    },
  });
  if (!latest) throw new AppError('NOT_FOUND', 'Published version not found');

  const etag = `"${latest.version}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'no-cache');

  const inm = req.get('If-None-Match');
  if (inm && inm === etag) {
    return res.status(304).end();
  }

  return ok(res, latest.payload);
});

export { sortPrayers };
