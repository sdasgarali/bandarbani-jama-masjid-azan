import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/ root = two levels up from src/config
export const backendRoot = path.resolve(__dirname, '..', '..');

export const uploadDir = path.isAbsolute(env.UPLOAD_DIR)
  ? env.UPLOAD_DIR
  : path.join(backendRoot, env.UPLOAD_DIR);

// APK builds for in-app auto-update live under uploads/apk.
export const apkDir = path.join(uploadDir, 'apk');

export function ensureUploadDir() {
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(apkDir, { recursive: true });
}

export default { backendRoot, uploadDir, apkDir, ensureUploadDir };
