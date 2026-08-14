import { prisma } from '../config/prisma.js';
import { isFcmEnabled, getMessaging } from '../config/firebase.js';
import { logger } from '../config/logger.js';

/**
 * Resolve the set of active FCM tokens to send to.
 * If deviceIds (app-generated deviceId strings) are provided, restrict to those.
 */
async function resolveTokens(deviceIds) {
  const where = { isActive: true };
  if (Array.isArray(deviceIds) && deviceIds.length > 0) {
    const devices = await prisma.device.findMany({
      where: { deviceId: { in: deviceIds } },
      select: { id: true },
    });
    const ids = devices.map((d) => d.id);
    if (ids.length === 0) return [];
    where.deviceId = { in: ids };
  }
  const rows = await prisma.fcmToken.findMany({ where, select: { id: true, token: true } });
  return rows;
}

// Clean up tokens FCM reports as unregistered/invalid.
async function deactivateTokens(tokenIds) {
  if (tokenIds.length === 0) return;
  try {
    await prisma.fcmToken.updateMany({
      where: { id: { in: tokenIds } },
      data: { isActive: false },
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to deactivate invalid FCM tokens');
  }
}

const INVALID_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Send a data-only message to the resolved token set.
 * @param {Record<string,string>} data - all values MUST be strings (FCM requirement)
 * @param {string[]} [deviceIds] - optional target device ids
 * @returns {Promise<{enabled:boolean, sent:number, failed:number, tokens:number}>}
 */
export async function sendData(data, deviceIds) {
  const tokens = await resolveTokens(deviceIds);

  if (!isFcmEnabled()) {
    logger.warn({ type: data.type, tokens: tokens.length }, 'FCM disabled — send skipped');
    return { enabled: false, sent: 0, failed: 0, tokens: tokens.length };
  }
  if (tokens.length === 0) {
    return { enabled: true, sent: 0, failed: 0, tokens: 0 };
  }

  const messaging = getMessaging();
  const message = {
    data,
    android: { priority: 'high' },
    tokens: tokens.map((t) => t.token),
  };

  try {
    const resp = await messaging.sendEachForMulticast(message);
    const invalidTokenIds = [];
    resp.responses.forEach((r, idx) => {
      if (!r.success) {
        const errCode = r.error?.code;
        if (INVALID_CODES.has(errCode)) invalidTokenIds.push(tokens[idx].id);
      }
    });
    await deactivateTokens(invalidTokenIds);
    logger.info(
      { type: data.type, sent: resp.successCount, failed: resp.failureCount },
      'FCM multicast sent'
    );
    return {
      enabled: true,
      sent: resp.successCount,
      failed: resp.failureCount,
      tokens: tokens.length,
    };
  } catch (err) {
    logger.error({ err: err.message, type: data.type }, 'FCM send failed');
    return { enabled: true, sent: 0, failed: tokens.length, tokens: tokens.length };
  }
}

// Typed helpers per the FCM contract in API.md (data-only).
export const sendScheduleUpdated = (version, deviceIds) =>
  sendData({ type: 'SCHEDULE_UPDATED', version: String(version) }, deviceIds);

export const sendConfigUpdated = (deviceIds) =>
  sendData({ type: 'CONFIG_UPDATED' }, deviceIds);

export const sendTestAzan = (deviceIds) => sendData({ type: 'TEST_AZAN' }, deviceIds);

export const sendTestNotification = (title, body, deviceIds) =>
  sendData({ type: 'TEST_NOTIFICATION', title: String(title), body: String(body) }, deviceIds);

export const sendAppUpdateAvailable = (versionCode, deviceIds) =>
  sendData({ type: 'APP_UPDATE_AVAILABLE', versionCode: String(versionCode) }, deviceIds);

export default {
  sendData,
  sendScheduleUpdated,
  sendConfigUpdated,
  sendTestAzan,
  sendTestNotification,
  sendAppUpdateAvailable,
};
