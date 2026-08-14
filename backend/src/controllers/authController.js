import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { ok } from '../utils/respond.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  signAccessToken,
  generateRefreshTokenRaw,
  hashRefreshToken,
  ttlToDate,
} from '../utils/jwt.js';
import { env } from '../config/env.js';
import { writeAudit } from '../services/audit.js';

function adminView(admin) {
  return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
}

async function issueRefreshToken(adminId) {
  const raw = generateRefreshTokenRaw();
  await prisma.refreshToken.create({
    data: {
      adminId,
      tokenHash: hashRefreshToken(raw),
      expiresAt: ttlToDate(env.REFRESH_TTL),
    },
  });
  return raw;
}

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const admin = await prisma.admin.findUnique({ where: { email } });
  // Constant-ish path: always run a compare to reduce user enumeration timing.
  const hash = admin?.passwordHash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinv';
  const valid = await bcrypt.compare(password, hash);
  if (!admin || !valid) {
    throw new AppError('AUTH_INVALID', 'Invalid email or password');
  }

  const accessToken = signAccessToken(admin);
  const refreshToken = await issueRefreshToken(admin.id);

  await writeAudit({
    adminId: admin.id,
    action: 'AUTH_LOGIN',
    entity: 'Admin',
    entityId: admin.id,
    ip: req.ip,
  });

  return ok(res, { accessToken, refreshToken, admin: adminView(admin) });
});

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const tokenHash = hashRefreshToken(refreshToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    throw new AppError('AUTH_INVALID', 'Invalid or expired refresh token');
  }

  const admin = await prisma.admin.findUnique({ where: { id: existing.adminId } });
  if (!admin) throw new AppError('AUTH_INVALID', 'Admin no longer exists');

  // Rotate: revoke the used token, issue a fresh pair.
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  const accessToken = signAccessToken(admin);
  const newRefresh = await issueRefreshToken(admin.id);

  return ok(res, { accessToken, refreshToken: newRefresh, admin: adminView(admin) });
});

export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return ok(res, { success: true });
});

export const me = asyncHandler(async (req, res) => {
  return ok(res, { admin: req.admin });
});
