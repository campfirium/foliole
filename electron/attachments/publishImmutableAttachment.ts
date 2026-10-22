import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { attachmentSourceVerification } from '../../lib/core/sync/attachmentSourceVerification.js';

import { notifyAttachmentPublished } from './attachmentPublishedEvents.js';

/** Only a fully written, verified inode becomes visible at a content-addressed path. */
export async function publishImmutableAttachment(destination: string, expectedHash: string,
  write: (temporary: string) => Promise<void>) {
  attachmentSourceVerification.invalidate(path.basename(destination));
  try { await verify(destination, expectedHash); return false; }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(path.dirname(destination), `.attachment-${randomUUID()}.tmp`);
  try {
    await write(temporary);
    await verify(temporary, expectedHash);
    return await renameVerifiedAttachment(temporary, destination, expectedHash);
  } finally { await rm(temporary, { force: true }); }
}

async function verify(file: string, expected: string) {
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(file)) digest.update(bytes);
  if (digest.digest('hex') !== expected) throw new Error('canonical_attachment_hash_mismatch');
}

/** The caller has verified the complete temporary file before publishing it. */
export async function renameVerifiedAttachment(temporary: string, destination: string, expectedHash: string) {
  attachmentSourceVerification.invalidate(path.basename(destination));
  try {
    await rename(temporary, destination);
    notifyAttachmentPublished(path.basename(destination));
    return true;
  }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || !['EEXIST', 'EPERM'].includes(String(error.code))) throw error;
    await verify(destination, expectedHash);
    await rm(temporary);
    return false;
  }
}
