import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Verifies the Bearer access token and attaches req.admin.
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AppError('AUTH_INVALID', 'Missing bearer token');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('AUTH_EXPIRED', 'Access token expired');
    }
    throw new AppError('AUTH_INVALID', 'Invalid access token');
  }

  const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
  if (!admin) throw new AppError('AUTH_INVALID', 'Admin no longer exists');

  req.admin = { id: admin.id, email: admin.email, role: admin.role, name: admin.name };
  next();
});

export default requireAuth;
