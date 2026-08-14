import fs from 'node:fs';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { ok } from '../utils/respond.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { writeAudit } from '../services/audit.js';
import { createAudioFromFile } from '../services/audioLibrary.js';
import { publishSchedule } from '../services/schedule.js';
import { buildAudioRef } from '../services/schedule.js';
import { sendScheduleUpdated } from '../services/fcm.js';
import {
  announcementCreateSchema,
  announcementUpdateSchema,
} from '../validators/schemas.js';

function safeUnlink(filePath) {
  try {
    if (filePath) fs.unlinkSync(filePath);
  } catch {
    /* best-effort cleanup */
  }
}

// Publish a new ScheduleVersion + FCM so devices re-arm their alarms after an
// announcement mutation. Audit for the publish itself is written here.
async function republish(req) {
  const { version, publishedAt, versionRow } = await publishSchedule({
    publishedById: req.admin.id,
  });
  await writeAudit({
    adminId: req.admin.id,
    action: 'SCHEDULE_PUBLISH',
    entity: 'ScheduleVersion',
    entityId: versionRow.id,
    metadata: { version, reason: 'announcement' },
    ip: req.ip,
  });
  const fcm = await sendScheduleUpdated(version);
  return { version, publishedAt, fcm };
}

// Serialise an announcement with its resolved audio meta.
async function announcementView(n) {
  const audio = n.audioId
    ? await prisma.azanAudio.findUnique({ where: { id: n.audioId } })
    : null;
  return {
    id: n.id,
    label: n.label ?? null,
    scheduledAt: (n.scheduledAt instanceof Date
      ? n.scheduledAt
      : new Date(n.scheduledAt)
    ).toISOString(),
    enabled: n.enabled,
    audioId: n.audioId,
    audio: buildAudioRef(audio),
    createdAt: n.createdAt,
  };
}

// POST /announcements — multipart. `audio` file (creates an ANNOUNCEMENT audio)
// OR `audioId` (reuse existing). Creates the announcement → auto-publish + FCM.
export const createAnnouncement = asyncHandler(async (req, res) => {
  const parsed = announcementCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    safeUnlink(req.file?.path);
    throw new AppError('VALIDATION', 'Validation failed', parsed.error.flatten());
  }
  const { label, scheduledAt, enabled } = parsed.data;
  let { audioId } = parsed.data;

  // Resolve the audio: an uploaded file takes precedence; otherwise require audioId.
  if (req.file) {
    const audio = await createAudioFromFile(req.file, {
      label,
      kind: 'ANNOUNCEMENT',
      uploadedById: req.admin.id,
    });
    audioId = audio.id;
    await writeAudit({
      adminId: req.admin.id,
      action: 'AUDIO_UPLOAD',
      entity: 'AzanAudio',
      entityId: audio.id,
      metadata: {
        version: audio.version,
        kind: audio.kind,
        checksum: audio.checksumSha256,
        sizeBytes: audio.sizeBytes,
      },
      ip: req.ip,
    });
  } else {
    if (!audioId) {
      throw new AppError('VALIDATION', 'Provide an `audio` file or an `audioId`');
    }
    const existing = await prisma.azanAudio.findUnique({ where: { id: audioId } });
    if (!existing) throw new AppError('NOT_FOUND', `Audio ${audioId} not found`);
  }

  const announcement = await prisma.announcement.create({
    data: {
      label: label ?? null,
      scheduledAt,
      enabled,
      audioId,
      createdById: req.admin.id,
    },
  });

  await writeAudit({
    adminId: req.admin.id,
    action: 'ANNOUNCEMENT_CREATE',
    entity: 'Announcement',
    entityId: announcement.id,
    metadata: { audioId, scheduledAt: scheduledAt.toISOString(), enabled },
    ip: req.ip,
  });

  const publishInfo = await republish(req);
  const view = await announcementView(announcement);
  return ok(res, { ...view, publish: publishInfo }, 201);
});

// GET /announcements — list newest scheduledAt first, with resolved audio meta.
export const listAnnouncements = asyncHandler(async (_req, res) => {
  const items = await prisma.announcement.findMany({ orderBy: { scheduledAt: 'desc' } });
  const announcements = await Promise.all(items.map(announcementView));
  return ok(res, { announcements });
});

// PUT /announcements/:id — mutate → auto-publish + FCM.
export const updateAnnouncement = asyncHandler(async (req, res) => {
  const id = req.validated?.params?.id ?? req.params.id;
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw new AppError('NOT_FOUND', 'Announcement not found');

  const parsed = announcementUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Validation failed', parsed.error.flatten());
  }

  const data = {};
  for (const key of ['label', 'scheduledAt', 'enabled', 'audioId']) {
    if (parsed.data[key] !== undefined) data[key] = parsed.data[key];
  }
  if (data.audioId !== undefined) {
    const audio = await prisma.azanAudio.findUnique({ where: { id: data.audioId } });
    if (!audio) throw new AppError('NOT_FOUND', `Audio ${data.audioId} not found`);
  }

  const updated = await prisma.announcement.update({ where: { id }, data });

  await writeAudit({
    adminId: req.admin.id,
    action: 'ANNOUNCEMENT_UPDATE',
    entity: 'Announcement',
    entityId: id,
    metadata: {
      changes: {
        ...data,
        ...(data.scheduledAt ? { scheduledAt: data.scheduledAt.toISOString() } : {}),
      },
    },
    ip: req.ip,
  });

  const publishInfo = await republish(req);
  const view = await announcementView(updated);
  return ok(res, { ...view, publish: publishInfo });
});

// DELETE /announcements/:id — remove → auto-publish + FCM.
export const deleteAnnouncement = asyncHandler(async (req, res) => {
  const id = req.validated?.params?.id ?? req.params.id;
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw new AppError('NOT_FOUND', 'Announcement not found');

  await prisma.announcement.delete({ where: { id } });

  await writeAudit({
    adminId: req.admin.id,
    action: 'ANNOUNCEMENT_DELETE',
    entity: 'Announcement',
    entityId: id,
    metadata: { audioId: existing.audioId },
    ip: req.ip,
  });

  const publishInfo = await republish(req);
  return ok(res, { id, deleted: true, publish: publishInfo });
});
