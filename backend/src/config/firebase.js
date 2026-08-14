import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { env } from './env.js';
import { logger } from './logger.js';

let messagingInstance = null;
let configured = false;

function loadServiceAccount() {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch {
      logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON is set but not valid JSON — FCM disabled.');
      return null;
    }
  }
  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    try {
      const p = path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);
      const raw = fs.readFileSync(p, 'utf8');
      return JSON.parse(raw);
    } catch {
      logger.warn(
        `FIREBASE_SERVICE_ACCOUNT_PATH set but file unreadable (${env.FIREBASE_SERVICE_ACCOUNT_PATH}) — FCM disabled.`
      );
      return null;
    }
  }
  return null;
}

/**
 * Initialize Firebase Admin. Never throws — if creds are absent/invalid the app
 * still runs and FCM sends become no-ops.
 */
export function initFirebase() {
  if (configured) return;
  configured = true;

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    logger.warn('Firebase credentials not provided — FCM sends will be no-op.');
    return;
  }

  try {
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    messagingInstance = admin.messaging();
    logger.info('Firebase Admin initialized — FCM enabled.');
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to initialize Firebase Admin — FCM disabled.');
    messagingInstance = null;
  }
}

export function isFcmEnabled() {
  return messagingInstance != null;
}

export function getMessaging() {
  return messagingInstance;
}

export default { initFirebase, isFcmEnabled, getMessaging };
