import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { upsertAttachmentBlobManifest } from '../database/attachmentBlobs.js';
import { createAttachmentRecord, findAttachmentRecordById } from '../database/attachments.js';

import { resolveAttachmentStoragePath } from './resourceResolver.js';
import { buildAttachmentStorageFileName } from './storagePath.js';

export interface StagedManagedAttachment {
  contentHash: string;
  createdAt: string;
  createdFile: boolean;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  storagePath: string;
}

function hashBytes(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function verifyStoredFile(storagePath: string, contentHash: string) {
  const existing = await fs.readFile(storagePath);
  if (hashBytes(existing) !== contentHash) throw new Error('managed_attachment_hash_mismatch');
}

export async function stageManagedAttachmentFile(input: {
  bytes: Uint8Array;
  mimeType: string;
  originalName: string;
  now?: string;
}): Promise<StagedManagedAttachment> {
  const contentHash = hashBytes(input.bytes);
  const storagePath = resolveAttachmentStoragePath(contentHash, undefined, input.mimeType);
  let createdFile = false;
  try {
    await verifyStoredFile(storagePath, contentHash);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await fs.mkdir(path.dirname(storagePath), { recursive: true });
    try {
      await fs.writeFile(storagePath, input.bytes, { flag: 'wx' });
      createdFile = !findAttachmentRecordById(contentHash);
    } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
      await verifyStoredFile(storagePath, contentHash);
    }
  }
  return {
    contentHash,
    createdAt: input.now ?? new Date().toISOString(),
    createdFile,
    mimeType: input.mimeType,
    originalName: path.basename(input.originalName),
    sizeBytes: input.bytes.byteLength,
    storagePath
  };
}

export function persistStagedManagedAttachment(stage: StagedManagedAttachment) {
  const existing = findAttachmentRecordById(stage.contentHash);
  if (existing && (existing.mimeType !== stage.mimeType || existing.sizeBytes !== stage.sizeBytes)) {
    throw new Error('managed_attachment_metadata_mismatch');
  }
  if (!existing) {
    createAttachmentRecord({
      createdAt: stage.createdAt,
      id: stage.contentHash,
      mimeType: stage.mimeType,
      originalName: stage.originalName,
      sizeBytes: stage.sizeBytes
    });
  }
  upsertAttachmentBlobManifest({
    attachmentId: stage.contentHash,
    availability: 'local',
    cachedAt: stage.createdAt,
    contentHash: stage.contentHash,
    createdAt: existing?.createdAt ?? stage.createdAt,
    lastVerifiedAt: stage.createdAt,
    mimeType: stage.mimeType,
    sizeBytes: stage.sizeBytes,
    sourceHostName: null,
    storageKey: buildAttachmentStorageFileName(stage.contentHash, stage.mimeType)
  });
}

export async function cleanCreatedManagedAttachmentFiles(stages: StagedManagedAttachment[]) {
  await Promise.all(stages.filter((stage) => stage.createdFile).map((stage) => fs.unlink(stage.storagePath).catch(() => undefined)));
}
