import { z } from 'zod';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// A 24-hex Mongo ObjectId, or null (to clear a reference). Multipart sends the
// literal strings "null"/"" — treat those as null too.
const objectIdOrNull = z
  .union([z.string(), z.null()])
  .transform((v) => {
    if (v === null) return null;
    const t = v.trim();
    if (t === '' || t.toLowerCase() === 'null') return null;
    return t;
  })
  .refine((v) => v === null || OBJECT_ID.test(v), {
    message: 'must be a 24-character hex ObjectId or null',
  });

// A required 24-hex Mongo ObjectId (no null).
const objectId = z
  .string()
  .trim()
  .refine((v) => OBJECT_ID.test(v), { message: 'must be a 24-character hex ObjectId' });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

export const scheduleMetaSchema = z.object({
  timezone: z.string().min(1),
  name: z.string().min(1).optional(),
  // Default fallback Azan audio; may be null to clear it.
  defaultAudioId: objectIdOrNull.optional(),
});

export const prayerParamSchema = z.object({
  prayer: z.enum(['FAJR', 'DHUHR', 'ASR', 'MAGHRIB', 'ISHA']),
});

export const prayerUpdateSchema = z
  .object({
    time: z.string().regex(HHMM, 'time must be HH:mm (24h)').optional(),
    enabled: z.boolean().optional(),
    audioEnabled: z.boolean().optional(),
    notificationEnabled: z.boolean().optional(),
    // This prayer's custom Azan; may be null to fall back to the schedule default.
    audioId: objectIdOrNull.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' });

export const registerDeviceSchema = z.object({
  deviceId: z.string().min(1),
  platform: z.string().default('android'),
  appVersion: z.string().optional(),
  androidVersion: z.coerce.number().int().optional(),
  model: z.string().optional(),
  timezone: z.string().optional(),
  fcmToken: z.string().optional(),
});

export const fcmTokenSchema = z.object({
  fcmToken: z.string().min(1),
});

export const heartbeatSchema = z.object({
  timezone: z.string().optional(),
  appVersion: z.string().optional(),
  scheduleVersion: z.coerce.number().int().optional(),
});

export const deviceIdsSchema = z.object({
  deviceIds: z.array(z.string().min(1)).optional(),
});

export const testNotificationSchema = z.object({
  deviceIds: z.array(z.string().min(1)).optional(),
  title: z.string().min(1).default('Test notification'),
  body: z.string().min(1).default('This is a test notification'),
});

export const configUpsertSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
});

export const audioVersionParamSchema = z.object({
  version: z.coerce.number().int().positive(),
});

// Multipart form fields arrive as strings, so coerce versionCode to int and
// mandatory to a boolean ("true"/"false"/"1"/"0" and native bools accepted).
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    return ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase());
  });

export const appReleaseUploadSchema = z.object({
  versionCode: z.coerce.number().int().positive(),
  versionName: z.string().trim().min(1),
  notes: z.string().trim().min(1).optional(),
  mandatory: booleanish.optional().default(false),
});

export const appReleaseVersionParamSchema = z.object({
  versionCode: z.coerce.number().int().positive(),
});

// ─── Audio library upload (multipart form fields) ────────────────────────────
export const audioUploadSchema = z.object({
  label: z.string().trim().min(1).optional(),
  kind: z
    .union([z.string(), z.undefined()])
    .transform((v) => (v === undefined || v === '' ? 'AZAN' : v.trim().toUpperCase()))
    .pipe(z.enum(['AZAN', 'ANNOUNCEMENT'])),
});

// ─── Announcements ───────────────────────────────────────────────────────────
// scheduledAt: an ISO-8601 instant. Coerce to Date and require a valid parse.
const isoInstant = z
  .string()
  .trim()
  .min(1)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'must be an ISO-8601 date-time' })
  .transform((v) => new Date(v));

// POST /announcements — multipart. `audio` file (handled by multer) OR `audioId`.
// When a file is present the controller ignores audioId; otherwise audioId is required.
export const announcementCreateSchema = z.object({
  label: z.string().trim().min(1).optional(),
  scheduledAt: isoInstant,
  enabled: booleanish.optional().default(true),
  audioId: objectId.optional(),
});

export const announcementUpdateSchema = z
  .object({
    label: z.string().trim().min(1).optional(),
    scheduledAt: isoInstant.optional(),
    enabled: booleanish.optional(),
    audioId: objectId.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' });

export const announcementIdParamSchema = z.object({
  id: objectId,
});
