import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { ok } from '../utils/respond.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { writeAudit } from '../services/audit.js';
import { sendAppUpdateAvailable } from '../services/fcm.js';
import { apkDir } from '../config/paths.js';
import { appReleaseUploadSchema } from '../validators/schemas.js';

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// APKs are ZIP archives — they must start with the "PK" magic bytes (0x50 0x4B).
function hasApkMagicBytes(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(2);
    fs.readSync(fd, buf, 0, 2, 0);
    return buf[0] === 0x50 && buf[1] === 0x4b;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function safeUnlink(filePath) {
  try {
    if (filePath) fs.unlinkSync(filePath);
  } catch {
    /* best-effort cleanup */
  }
}

// Shape returned to clients — never leaks the internal stored path/name.
function releaseView(r) {
  return {
    id: r.id,
    versionCode: r.versionCode,
    versionName: r.versionName,
    notes: r.notes ?? null,
    mandatory: r.mandatory,
    sizeBytes: r.sizeBytes,
    checksumSha256: r.checksumSha256,
    apkOriginalName: r.apkOriginalName,
    apkPath: `app/releases/${r.versionCode}/file`,
    createdAt: r.createdAt,
  };
}

// POST /app/releases — multipart 'apk'. multer validated extension + size.
export const uploadRelease = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('FILE_INVALID', 'No file uploaded (field "apk")');

  // Body fields arrive as strings from multipart — validate + coerce here (after multer).
  const parsed = appReleaseUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    safeUnlink(req.file.path);
    throw new AppError('VALIDATION', 'Validation failed', parsed.error.flatten());
  }
  const { versionCode, versionName, notes, mandatory } = parsed.data;

  if (!hasApkMagicBytes(req.file.path)) {
    safeUnlink(req.file.path);
    throw new AppError('FILE_INVALID', 'Uploaded file is not a valid APK (missing PK signature)');
  }

  // Reject duplicate versionCode.
  const existing = await prisma.appRelease.findUnique({ where: { versionCode } });
  if (existing) {
    safeUnlink(req.file.path);
    throw new AppError('VALIDATION', `Release with versionCode ${versionCode} already exists`);
  }

  const checksum = await sha256File(req.file.path);

  // Rename to a deterministic, safe stored name including the versionCode.
  const storedName = `app-v${versionCode}-${crypto.randomBytes(6).toString('hex')}.apk`;
  const finalPath = path.join(apkDir, storedName);
  try {
    fs.renameSync(req.file.path, finalPath);
  } catch {
    safeUnlink(req.file.path);
    throw new AppError('INTERNAL', 'Failed to store uploaded APK');
  }

  let release;
  try {
    release = await prisma.appRelease.create({
      data: {
        versionCode,
        versionName,
        notes: notes ?? null,
        mandatory,
        apkStoredName: storedName,
        apkOriginalName: req.file.originalname,
        sizeBytes: req.file.size,
        checksumSha256: checksum,
        uploadedById: req.admin.id,
      },
    });
  } catch (err) {
    safeUnlink(finalPath);
    throw err;
  }

  await writeAudit({
    adminId: req.admin.id,
    action: 'app_release.upload',
    entity: 'AppRelease',
    entityId: release.id,
    metadata: { versionCode, versionName, mandatory, checksum, sizeBytes: release.sizeBytes },
    ip: req.ip,
  });

  const fcm = await sendAppUpdateAvailable(versionCode);

  return ok(res, { ...releaseView(release), fcm }, 201);
});

// GET /app/releases — list all releases, newest first (admin).
export const listReleases = asyncHandler(async (_req, res) => {
  const items = await prisma.appRelease.findMany({ orderBy: { versionCode: 'desc' } });
  return ok(res, { releases: items.map(releaseView) });
});

// GET /app/latest-version — public. Latest release by versionCode. ETag + 304.
export const latestVersion = asyncHandler(async (req, res) => {
  const latest = await prisma.appRelease.findFirst({ orderBy: { versionCode: 'desc' } });
  if (!latest) throw new AppError('NOT_FOUND', 'No app releases available');

  const etag = `"${latest.versionCode}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'no-cache');

  const inm = req.get('If-None-Match');
  if (inm && inm === etag) {
    return res.status(304).end();
  }

  return ok(res, {
    versionCode: latest.versionCode,
    versionName: latest.versionName,
    notes: latest.notes ?? null,
    mandatory: latest.mandatory,
    sizeBytes: latest.sizeBytes,
    checksumSha256: latest.checksumSha256,
    apkPath: `app/releases/${latest.versionCode}/file`,
  });
});

// GET /app/releases/:versionCode/file — public. Streams the APK with Range support.
export const streamRelease = asyncHandler(async (req, res) => {
  const versionCode = req.validated?.params?.versionCode ?? Number(req.params.versionCode);
  const release = await prisma.appRelease.findUnique({ where: { versionCode } });
  if (!release) throw new AppError('NOT_FOUND', 'Release not found');

  const filePath = path.join(apkDir, release.apkStoredName);
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw new AppError('NOT_FOUND', 'APK file missing on disk');
  }

  const total = stat.size;
  const range = req.headers.range;

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="app-v${release.versionCode}.apk"`
  );
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
