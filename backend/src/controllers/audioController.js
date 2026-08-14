import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { ok } from '../utils/respond.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { writeAudit } from '../services/audit.js';
import { buildAudioRef } from '../services/schedule.js';
import { createAudioFromFile } from '../services/audioLibrary.js';
import { audioUploadSchema } from '../validators/schemas.js';
import { uploadDir } from '../config/paths.js';

// POST /audio — multipart 'file' (+ optional label, kind). multer validated mime+size.
// Adds a row to the library; does NOT deactivate other audios (library semantics).
export const uploadAudio = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('FILE_INVALID', 'No file uploaded (field "file")');

  // Multipart body fields arrive as strings — validate + coerce here (after multer).
  const parsed = audioUploadSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Validation failed', parsed.error.flatten());
  }
  const { label, kind } = parsed.data;

  const audio = await createAudioFromFile(req.file, {
    label,
    kind,
    uploadedById: req.admin.id,
  });

  await writeAudit({
    adminId: req.admin.id,
    action: 'AUDIO_UPLOAD',
    entity: 'AzanAudio',
    entityId: audio.id,
    metadata: {
      version: audio.version,
      kind: audio.kind,
      checksum: audio.checksumSha256,
      sizeBytes: audio.sizeBytes,
    },
    ip: req.ip,
  });

  return ok(res, buildAudioRef(audio), 201);
});

// GET /audio — list the audio library.
export const listAudio = asyncHandler(async (_req, res) => {
  const items = await prisma.azanAudio.findMany({ orderBy: { version: 'desc' } });
  return ok(res, {
    audio: items.map((a) => ({
      id: a.id,
      label: a.label ?? null,
      kind: a.kind,
      version: a.version,
      sizeBytes: a.sizeBytes,
      checksumSha256: a.checksumSha256,
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
