import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { publishImmutableAttachment } from './publishImmutableAttachment.js';
import { resolveAttachmentStoragePath } from './resourceResolver.js';

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

export async function stageManagedAttachmentFile(input: {
  bytes: Uint8Array;
  mimeType: string;
  originalName: string;
  now?: string;
}): Promise<StagedManagedAttachment> {
  const contentHash = hashBytes(input.bytes);
  const storagePath = resolveAttachmentStoragePath(contentHash, undefined, input.mimeType);
  const createdFile = await publishImmutableAttachment(storagePath, contentHash,
    temporary => fs.writeFile(temporary, input.bytes, { flag: 'wx' }));
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

export async function cleanCreatedManagedAttachmentFiles(stages: StagedManagedAttachment[]) {
  await Promise.all(stages.filter((stage) => stage.createdFile).map((stage) => fs.unlink(stage.storagePath).catch(() => undefined)));
}
