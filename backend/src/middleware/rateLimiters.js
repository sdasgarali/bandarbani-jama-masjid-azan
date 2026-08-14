import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const rateLimitedBody = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' },
};

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitedBody,
  // Disable limiting in tests to keep the suite deterministic.
  skip: () => env.isTest,
};

// Auth endpoints: 10/min/IP.
export const authLimiter = rateLimit({ ...base, windowMs: 60_000, max: 10 });

// General admin: 120/min.
export const adminLimiter = rateLimit({ ...base, windowMs: 60_000, max: 120 });

// Device register: 30/min/IP.
export const deviceRegisterLimiter = rateLimit({ ...base, windowMs: 60_000, max: 30 });

// Public, unauthenticated read access (streaming audio/APK files). Higher ceiling because
// HTTP Range requests for a single media file can produce several requests.
export const publicReadLimiter = rateLimit({ ...base, windowMs: 60_000, max: 240 });
