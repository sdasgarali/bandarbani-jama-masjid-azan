import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { uploadDir, apkDir, ensureUploadDir } from '../config/paths.js';
import { AppError } from '../utils/errors.js';

ensureUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, _file, cb) => {
    const name = `azan-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.mp3`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  if (file.mimetype !== 'audio/mpeg') {
    return cb(new AppError('FILE_INVALID', 'Only audio/mpeg (MP3) is allowed'));
  }
  cb(null, true);
}

export const audioUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.maxAudioBytes, files: 1 },
});

// ─── APK upload (in-app auto-update) ─────────────────────────────────────────
// The versionCode isn't reliably available in req.body during the filename
// callback (multipart field ordering), so we store under a random name and the
// controller renames it to app-v<versionCode>-<random>.apk after validation.
const apkStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, apkDir),
  filename: (_req, _file, cb) => {
    const name = `app-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.apk`;
    cb(null, name);
  },
});

// Android APK mimetypes are inconsistent (vnd.android.package-archive or
// application/octet-stream), so we validate by extension. Magic-byte ("PK")
// verification happens in the controller once the file is on disk.
function apkFileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext !== '.apk') {
    return cb(new AppError('FILE_INVALID', 'Only .apk files are allowed'));
  }
  cb(null, true);
}

export const apkUpload = multer({
  storage: apkStorage,
  fileFilter: apkFileFilter,
  limits: { fileSize: env.maxApkBytes, files: 1 },
});

export default audioUpload;
