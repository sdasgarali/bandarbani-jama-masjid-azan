import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';

const PRAYER_ORDER = ['FAJR', 'DHUHR', 'ASR', 'MAGHRIB', 'ISHA'];

// Sort prayer rows into canonical Fajr..Isha order.
export function sortPrayers(prayers) {
  return [...prayers].sort(
    (a, b) => PRAYER_ORDER.indexOf(a.prayer) - PRAYER_ORDER.indexOf(b.prayer)
  );
}

// The single MVP schedule. Throws NOT_FOUND if not seeded.
export async function getSchedule() {
  const schedule = await prisma.prayerSchedule.findFirst({
    include: { prayers: true },
  });
  if (!schedule) throw new AppError('NOT_FOUND', 'No schedule configured');
  return { ...schedule, prayers: sortPrayers(schedule.prayers) };
}

// Build the exact published-payload audio ref (DATABASE.md). `path` is relative;
// the app builds the absolute URL from its own API base (API_BASE_URL + path).
export function buildAudioRef(audio) {
  if (!audio) return null;
  return {
    id: audio.id,
    label: audio.label ?? null,
    version: audio.version,
    path: `audio/${audio.version}/file`,
    checksumSha256: audio.checksumSha256,
    sizeBytes: audio.sizeBytes,
    mimeType: audio.mimeType,
  };
}

/**
 * Build the exact published payload shape (DATABASE.md):
 *   version, timezone, defaultAudioId, prayers[] (each with audioId),
 *   audios[] (deduped refs for every audio referenced by a prayer or the default),
 *   announcements[] (enabled + future, each with inline audio ref), publishedAt.
 *
 * @param {object}   args
 * @param {number}   args.version
 * @param {string}   args.timezone
 * @param {Array}    args.prayers          prayer rows (with optional audioId)
 * @param {string?}  args.defaultAudioId   schedule's default audio id (or null)
 * @param {Array}    args.audios           AzanAudio rows referenced by prayers/default
 * @param {Array}    args.announcements    Announcement rows (each with resolved `audio`)
 * @param {Date}     args.publishedAt
 */
export function buildPayload({
  version,
  timezone,
  prayers,
  defaultAudioId = null,
  audios = [],
  announcements = [],
  publishedAt,
}) {
  // Deduped audio refs by id (order-stable).
  const seen = new Set();
  const audioRefs = [];
  for (const a of audios) {
    if (!a || seen.has(a.id)) continue;
    seen.add(a.id);
    audioRefs.push(buildAudioRef(a));
  }

  return {
    version,
    timezone,
    defaultAudioId: defaultAudioId ?? null,
    prayers: sortPrayers(prayers).map((p) => ({
      prayer: p.prayer,
      time: p.time,
      enabled: p.enabled,
      audioEnabled: p.audioEnabled,
      notificationEnabled: p.notificationEnabled,
      audioId: p.audioId ?? null,
    })),
    audios: audioRefs,
    announcements: announcements.map((n) => ({
      id: n.id,
      label: n.label ?? null,
      scheduledAt: (n.scheduledAt instanceof Date
        ? n.scheduledAt
        : new Date(n.scheduledAt)
      ).toISOString(),
      enabled: n.enabled,
      audio: buildAudioRef(n.audio),
    })),
    publishedAt: (publishedAt instanceof Date
      ? publishedAt
      : new Date(publishedAt)
    ).toISOString(),
  };
}

/**
 * Assemble everything a publish needs from the DB at `publishedAt`:
 *   - the deduped set of AzanAudio rows referenced by any prayer OR the default
 *   - the enabled announcements whose scheduledAt is in the future (with `audio` resolved)
 * Returns { defaultAudioId, audios, announcements }.
 */
export async function collectPublishData(schedule, publishedAt) {
  const defaultAudioId = schedule.defaultAudioId ?? null;

  // Collect the ids of every audio referenced by a prayer or the default.
  const audioIds = new Set();
  if (defaultAudioId) audioIds.add(defaultAudioId);
  for (const p of schedule.prayers) {
    if (p.audioId) audioIds.add(p.audioId);
  }

  const audios =
    audioIds.size > 0
      ? await prisma.azanAudio.findMany({ where: { id: { in: [...audioIds] } } })
      : [];

  // Enabled announcements with scheduledAt strictly in the future (relative to publish time).
  const rawAnnouncements = await prisma.announcement.findMany({
    where: { enabled: true, scheduledAt: { gt: publishedAt } },
    orderBy: { scheduledAt: 'asc' },
  });

  // Resolve each announcement's audio (memoryPrisma has no nested include for this).
  const annAudioIds = [...new Set(rawAnnouncements.map((n) => n.audioId).filter(Boolean))];
  const annAudioRows = annAudioIds.length
    ? await prisma.azanAudio.findMany({ where: { id: { in: annAudioIds } } })
    : [];
  const annAudioById = new Map(annAudioRows.map((a) => [a.id, a]));
  const announcements = rawAnnouncements.map((n) => ({
    ...n,
    audio: annAudioById.get(n.audioId) ?? null,
  }));

  return { defaultAudioId, audios, announcements };
}

/**
 * Publish the current schedule: snapshot a new immutable ScheduleVersion, bump the
 * schedule's version + mark published. Returns { version, publishedAt, versionRow }.
 * The caller is responsible for audit logging and FCM fan-out.
 */
export async function publishSchedule({ publishedById } = {}) {
  const schedule = await getSchedule();
  const nextVersion = schedule.currentVersion + 1;
  const publishedAt = new Date();

  const { defaultAudioId, audios, announcements } = await collectPublishData(
    schedule,
    publishedAt
  );

  const payload = buildPayload({
    version: nextVersion,
    timezone: schedule.timezone,
    prayers: schedule.prayers,
    defaultAudioId,
    audios,
    announcements,
    publishedAt,
  });

  const versionRow = await prisma.scheduleVersion.create({
    data: {
      scheduleId: schedule.id,
      version: nextVersion,
      timezone: schedule.timezone,
      payload,
      publishedById: publishedById ?? null,
      publishedAt,
    },
  });

  await prisma.prayerSchedule.update({
    where: { id: schedule.id },
    data: { currentVersion: nextVersion, isPublished: true },
  });

  return { version: nextVersion, publishedAt, versionRow };
}
