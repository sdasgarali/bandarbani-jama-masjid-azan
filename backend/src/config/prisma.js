import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

// Singleton PrismaClient. Reused across hot reloads in dev.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__azanPrisma ??
  new PrismaClient({
    log: env.isProd ? ['error'] : ['error', 'warn'],
  });

if (!env.isProd) {
  globalForPrisma.__azanPrisma = prisma;
}

export default prisma;
