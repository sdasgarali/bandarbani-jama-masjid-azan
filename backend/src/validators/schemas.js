import { z } from 'zod';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

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
