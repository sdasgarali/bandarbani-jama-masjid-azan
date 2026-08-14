import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { ok } from '../utils/respond.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { writeAudit } from '../services/audit.js';
import { buildAudioRef } from '../services/schedule.js';
import { uploadDir } from '../config/paths.js';

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// POST /audio — multipart 'file'. multer already validated mime+size.
export const uploadAudio = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('FILE_INVALID', 'No file uploaded (field "file")');

  const checksum = await sha256File(req.file.path);

  const latest = await prisma.azanAudio.findFirst({ orderBy: { version: 'desc' } });
  const nextVersion = (latest?.version ?? 0) + 1;

  // Deactivate previous active audio.
  await prisma.azanAudio.updateMany({ where: { isActive: true }, data: { isActive: false } });

  const audio = await prisma.azanAudio.create({
    data: {
      filename: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      checksumSha256: checksum,
      version: nextVersion,
      isActive: true,
      uploadedById: req.admin.id,
    },
  });

  await writeAudit({
    adminId: req.admin.id,
    action: 'AUDIO_UPLOAD',
    entity: 'AzanAudio',
    entityId: audio.id,
    metadata: { version: nextVersion, checksum, sizeBytes: audio.sizeBytes },
    ip: req.ip,
  });

  return ok(res, buildAudioRef(audio), 201);
});

// GET /audio — list metadata.
export const listAudio = asyncHandler(async (_req, res) => {
  const items = await prisma.azanAudio.findMany({ orderBy: { version: 'desc' } });
  return ok(res, {
    audio: items.map((a) => ({
      id: a.id,
      version: a.version,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      checksumSha256: a.checksumSha256,
      durationMs: a.durationMs,
      isActive: a.isActive,
      url: `/api/v1/audio/${a.version}/file`,
      createdAt: a.createdAt,
    })),
  });
});

// GET /audio/:version/meta
export const audioMeta = asyncHandler(async (req, res) => {
  const version = req.validated?.params?.version ?? Number(req.params.version);
  const audio = await prisma.azanAudio.findUnique({ where: { version } });
  if (!audio) throw new AppError('NOT_FOUND', 'Audio version not found');
  return ok(res, buildAudioRef(audio));
});

// GET /audio/:version/file — streams MP3 with Range support.
export const streamAudio = asyncHandler(async (req, res) => {
  const version = req.validated?.params?.version ?? Number(req.params.version);
  const audio = await prisma.azanAudio.findUnique({ where: { version } });
  if (!audio) throw new AppError('NOT_FOUND', 'Audio version not found');

  const filePath = path.join(uploadDir, audio.storedName);
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw new AppError('NOT_FOUND', 'Audio file missing on disk');
  }

  const total = stat.size;
  const range = req.headers.range;

  res.setHeader('Content-Type', audio.mimeType || 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`);
      return res.end();
    }
    let start = m[1] === '' ? 0 : parseInt(m[1], 10);
    let end = m[2] === '' ? total - 1 : parseInt(m[2], 10);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= total) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`);
      return res.end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', end - start + 1);
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }

  res.status(200);
  res.setHeader('Content-Length', total);
  return fs.createReadStream(filePath).pipe(res);
});
