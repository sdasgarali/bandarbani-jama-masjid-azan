import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Device auth via X-Device-Id + X-Device-Secret (bcrypt-checked against deviceSecretHash).
export const requireDevice = asyncHandler(async (req, _res, next) => {
  const deviceId = req.get('X-Device-Id');
  const deviceSecret = req.get('X-Device-Secret');
  if (!deviceId || !deviceSecret) {
    throw new AppError('AUTH_INVALID', 'Missing device credentials');
  }

  const device = await prisma.device.findUnique({ where: { deviceId } });
  if (!device) throw new AppError('AUTH_INVALID', 'Unknown device');

  const okSecret = await bcrypt.compare(deviceSecret, device.deviceSecretHash);
  if (!okSecret) throw new AppError('AUTH_INVALID', 'Invalid device secret');

  req.device = device;
  next();
});

export default requireDevice;
