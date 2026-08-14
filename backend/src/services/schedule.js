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

// Build the exact published-payload audio ref (DATABASE.md) from the active audio.
export function buildAudioRef(audio) {
  if (!audio) return null;
  return {
    id: audio.id,
    version: audio.version,
    url: `/api/v1/audio/${audio.version}/file`,
    checksumSha256: audio.checksumSha256,
    sizeBytes: audio.sizeBytes,
    mimeType: audio.mimeType,
  };
}

// Build the exact published payload shape.
export function buildPayload({ version, timezone, prayers, audio, publishedAt }) {
  return {
    version,
    timezone,
    prayers: sortPrayers(prayers).map((p) => ({
      prayer: p.prayer,
      time: p.time,
      enabled: p.enabled,
      audioEnabled: p.audioEnabled,
      notificationEnabled: p.notificationEnabled,
    })),
    audio: buildAudioRef(audio),
    publishedAt: (publishedAt instanceof Date ? publishedAt : new Date(publishedAt)).toISOString(),
  };
}
