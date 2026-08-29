import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { upsertAttachmentBlobManifest } from '../database/attachmentBlobs.js';
import { createAttachmentRecord, createNodeAttachmentLink, findAttachmentRecordById } from '../database/attachments.js';
import { openDatabaseConnection } from '../database/connection.js';

import { resolveAttachmentStoragePath } from './resourceResolver.js';
import { buildAttachmentStorageFileName } from './storagePath.js';
import { validateSupportedImageBytes } from './supportedImageFormats.js';

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

async function writeCanonicalFile(filePath: string, bytes: Uint8Array) {
  try {
    await fs.access(filePath);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes, { flag: 'wx' });
  return true;
}

export async function persistCreatedNodeImageAttachment(args: {
  bytes: Uint8Array;
  expectedHash: string;
  mimeType: 'image/png';
  nodeId: string;
  originalName: string;
  persistNode: () => void;
}) {
  if (args.bytes.byteLength === 0 || args.bytes.byteLength > MAX_IMAGE_BYTES ||
      !validateSupportedImageBytes(args.bytes, args.mimeType)) {
    throw new Error('invalid argument: image bytes');
  }
  const hash = createHash('sha256').update(args.bytes).digest('hex');
  if (hash !== args.expectedHash) throw new Error('invalid argument: image hash');
  const originalName = args.originalName.trim() || 'pdf-image-excerpt.png';
  const existing = findAttachmentRecordById(hash);
  const storagePath = resolveAttachmentStoragePath(hash, undefined, existing?.originalName ?? originalName);
  const createdFile = await writeCanonicalFile(storagePath, args.bytes);
  const createdAt = existing?.createdAt ?? new Date().toISOString();
  try {
    openDatabaseConnection().driver.transaction(() => {
      args.persistNode();
      if (!existing) {
        createAttachmentRecord({ id: hash, originalName, mimeType: args.mimeType, sizeBytes: args.bytes.byteLength, createdAt });
      }
      upsertAttachmentBlobManifest({
        attachmentId: hash,
        availability: 'local',
        cachedAt: createdAt,
        contentHash: hash,
        createdAt,
        lastVerifiedAt: createdAt,
        mimeType: args.mimeType,
        sizeBytes: args.bytes.byteLength,
        sourceHostName: null,
        storageKey: buildAttachmentStorageFileName(hash, existing?.originalName ?? originalName)
      });
      createNodeAttachmentLink({ attachmentId: hash, nodeId: args.nodeId, role: 'image' });
    });
  } catch (error) {
    if (createdFile) await fs.unlink(storagePath).catch(() => undefined);
    throw error;
  }
  return hash;
}
