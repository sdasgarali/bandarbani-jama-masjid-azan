import 'dotenv/config';
import { z } from 'zod';

// Fail-fast env validation. In test mode we relax DB/JWT requirements so the
// suite runs without external services (Prisma + Firebase are mocked in tests).
const isTest = process.env.NODE_ENV === 'test';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:4000'),

  DATABASE_URL: isTest
    ? z.string().default('mongodb://localhost:27017/azan_test')
    : z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: isTest
    ? z.string().default('test-access-secret')
    : z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: isTest
    ? z.string().default('test-refresh-secret')
    : z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL: z.string().default('30d'),

  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  MAX_AUDIO_MB: z.coerce.number().positive().default(10),
  MAX_APK_MB: z.coerce.number().positive().default(100),
  UPLOAD_DIR: z.string().default('uploads'),

  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),

  DEVICE_INACTIVE_MINUTES: z.coerce.number().positive().default(1440),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:');
  // eslint-disable-next-line no-console
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isTest,
  isProd: raw.NODE_ENV === 'production',
  corsOrigins:
    raw.CORS_ORIGINS === '*'
      ? '*'
      : raw.CORS_ORIGINS.split(',')
          .map((o) => o.trim())
          .filter(Boolean),
  maxAudioBytes: raw.MAX_AUDIO_MB * 1024 * 1024,
  maxApkBytes: raw.MAX_APK_MB * 1024 * 1024,
};

export default env;
