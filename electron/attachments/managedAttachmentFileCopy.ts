import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { copyFile, mkdir, open, stat } from 'node:fs/promises';
import path from 'node:path';

import { classifyAttachmentBytes } from '../../lib/platform/attachmentByteClassification.js';

import type { StagedManagedAttachment } from './managedAttachmentFileStage.js';
import { resolveAttachmentStoragePath } from './resourceResolver.js';
import { buildAttachmentStorageFileName } from './storagePath.js';

export async function hashAttachmentFile(filePath: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

export async function readAttachmentPrefix(filePath: string) {
  const file = await open(filePath, 'r');
  try {
    const prefix = Buffer.alloc(64 * 1024);
    const { bytesRead } = await file.read(prefix, 0, prefix.length, 0);
    return prefix.subarray(0, bytesRead);
  } finally { await file.close(); }
}

export async function prepareCanonicalImageAttachmentFile(filePath: string) {
  const mimeType = classifyAttachmentBytes(await readAttachmentPrefix(filePath));
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) return null;
  const hash = await hashAttachmentFile(filePath);
  return { hash, mimeType, sizeBytes: (await stat(filePath)).size, storageKey: buildAttachmentStorageFileName(hash, mimeType) };
}

export async function stageManagedAttachmentFileCopy(input: {
  sourcePath: string;
  contentHash: string;
  mimeType: string;
  originalName: string;
  now?: string;
}): Promise<StagedManagedAttachment> {
  const storagePath = resolveAttachmentStoragePath(input.contentHash, undefined, input.mimeType);
  await mkdir(path.dirname(storagePath), { recursive: true });
  let createdFile = false;
  try {
    await copyFile(input.sourcePath, storagePath, constants.COPYFILE_EXCL);
    createdFile = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (await hashAttachmentFile(storagePath) !== input.contentHash) throw new Error('managed_attachment_hash_mismatch');
  }
  return {
    contentHash: input.contentHash, createdAt: input.now ?? new Date().toISOString(), createdFile,
    mimeType: input.mimeType, originalName: path.basename(input.originalName),
    sizeBytes: (await stat(storagePath)).size, storagePath
  };
}
