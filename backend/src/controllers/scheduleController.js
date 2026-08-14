import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { ok } from '../utils/respond.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getSchedule, publishSchedule, sortPrayers } from '../services/schedule.js';
import { writeAudit } from '../services/audit.js';
import { sendScheduleUpdated } from '../services/fcm.js';

// Ensure an audioId references an existing AzanAudio (null passes through).
async function assertAudioExists(audioId) {
  if (audioId == null) return;
  const audio = await prisma.azanAudio.findUnique({ where: { id: audioId } });
  if (!audio) throw new AppError('NOT_FOUND', `Audio ${audioId} not found`);
}

// GET /schedule — current draft + prayer times (admin).
export const getDraft = asyncHandler(async (_req, res) => {
  const schedule = await getSchedule();
  return ok(res, {
    id: schedule.id,
    name: schedule.name,
    timezone: schedule.timezone,
    currentVersion: schedule.currentVersion,
    isPublished: schedule.isPublished,
    defaultAudioId: schedule.defaultAudioId ?? null,
    prayers: schedule.prayers.map((p) => ({
      prayer: p.prayer,
      time: p.time,
      enabled: p.enabled,
      audioEnabled: p.audioEnabled,
      notificationEnabled: p.notificationEnabled,
      audioId: p.audioId ?? null,
    })),
    updatedAt: schedule.updatedAt,
  });
});

// PUT /schedule — update meta (timezone / name / default Azan audio).
export const updateMeta = asyncHandler(async (req, res) => {
  const schedule = await getSchedule();
  const { timezone, name, defaultAudioId } = req.body;

  const data = { timezone, ...(name ? { name } : {}) };
  if (defaultAudioId !== undefined) {
    await assertAudioExists(defaultAudioId);
    data.defaultAudioId = defaultAudioId; // may be null to clear
  }

  const updated = await prisma.prayerSchedule.update({
    where: { id: schedule.id },
    data,
  });
  await writeAudit({
    adminId: req.admin.id,
    action: 'SCHEDULE_UPDATE_META',
    entity: 'PrayerSchedule',
    entityId: updated.id,
    metadata: { timezone, name, defaultAudioId },
    ip: req.ip,
  });
  return ok(res, {
    id: updated.id,
    name: updated.name,
    timezone: updated.timezone,
    defaultAudioId: updated.defaultAudioId ?? null,
  });
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
  for (const key of ['time', 'enabled', 'audioEnabled', 'notificationEnabled', 'audioId']) {
    if (req.body[key] !== undefined) data[key] = req.body[key];
  }
  if (data.audioId !== undefined) await assertAudioExists(data.audioId);

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
    audioId: updated.audioId ?? null,
  });
});

// POST /schedule/publish — snapshot → new ScheduleVersion, bump version, FCM fan-out.
export const publish = asyncHandler(async (req, res) => {
  const { version, publishedAt, versionRow } = await publishSchedule({
    publishedById: req.admin.id,
  });

  await writeAudit({
    adminId: req.admin.id,
    action: 'SCHEDULE_PUBLISH',
    entity: 'ScheduleVersion',
    entityId: versionRow.id,
    metadata: { version },
    ip: req.ip,
  });

  const fcm = await sendScheduleUpdated(version);

  return ok(res, { version, publishedAt: publishedAt.toISOString(), fcm }, 201);
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
