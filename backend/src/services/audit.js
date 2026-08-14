import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';

/**
 * Write an audit log for an admin mutation. Never throws — audit failures must
 * not break the primary operation.
 */
export async function writeAudit({ adminId, action, entity, entityId, metadata, ip } = {}) {
  try {
    await prisma.auditLog.create({
      data: {
        adminId: adminId ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        metadata: metadata ?? {},
        ip: ip ?? null,
      },
    });
  } catch (err) {
    logger.warn({ err: err.message, action }, 'Failed to write audit log');
  }
}

export default { writeAudit };
