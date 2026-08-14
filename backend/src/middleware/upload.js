import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { uploadDir, ensureUploadDir } from '../config/paths.js';
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

export default audioUpload;
