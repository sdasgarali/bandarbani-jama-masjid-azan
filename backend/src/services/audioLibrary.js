import fs from 'node:fs';
import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';

// Stream-compute the sha256 of a file on disk (avoids loading big files in memory).
export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Turn an uploaded multer file into a library AzanAudio row.
 * Assigns the next monotonic `version` and computes the sha256 checksum.
 * Library semantics: this does NOT deactivate any other audio.
 *
 * @param {Express.Multer.File} file
 * @param {object} opts
 * @param {string?} opts.label
 * @param {string}  opts.kind         "AZAN" | "ANNOUNCEMENT" (default "AZAN")
 * @param {string?} opts.uploadedById
 * @returns {Promise<object>} the created AzanAudio row
 */
export async function createAudioFromFile(file, { label, kind = 'AZAN', uploadedById } = {}) {
  const checksum = await sha256File(file.path);

  const latest = await prisma.azanAudio.findFirst({ orderBy: { version: 'desc' } });
  const nextVersion = (latest?.version ?? 0) + 1;

  return prisma.azanAudio.create({
    data: {
      label: label ?? null,
      kind,
      filename: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      checksumSha256: checksum,
      version: nextVersion,
      isActive: false,
      uploadedById: uploadedById ?? null,
    },
  });
}

export default { sha256File, createAudioFromFile };
