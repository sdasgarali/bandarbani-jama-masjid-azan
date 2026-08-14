import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signAccessToken(admin) {
  return jwt.sign({ sub: admin.id, email: admin.email, role: admin.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TTL,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

// Refresh tokens are opaque random strings; we persist a SHA-256 hash of them.
export function generateRefreshTokenRaw() {
  return crypto.randomBytes(48).toString('hex');
}

export function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Parse a ms-style TTL string (e.g. "30d", "15m", "3600s") into a future Date.
export function ttlToDate(ttl) {
  const m = String(ttl).match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
  if (!m) throw new Error(`Invalid TTL: ${ttl}`);
  const value = Number(m[1]);
  const unit = (m[2] || 'ms').toLowerCase();
  const factors = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return new Date(Date.now() + value * factors[unit]);
}
