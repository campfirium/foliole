import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { attachmentSourceVerification } from '../../lib/core/sync/attachmentSourceVerification.js';

import { notifyAttachmentPublished } from './attachmentPublishedEvents.js';

/** Only a fully written, verified inode becomes visible at a content-addressed path. */
export async function publishImmutableAttachment(destination: string, expectedHash: string,
  write: (temporary: string) => Promise<void>, verifyWritten = true) {
  attachmentSourceVerification.invalidate(path.basename(destination));
  try { await verify(destination, expectedHash); return false; }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(path.dirname(destination), `.attachment-${randomUUID()}.tmp`);
  try {
    await write(temporary);
    if (verifyWritten) await verify(temporary, expectedHash);
    return await renameVerifiedAttachment(temporary, destination, expectedHash);
  } finally { await rm(temporary, { force: true }); }
}

/**
 * Publishes in-memory bytes whose hash the caller computed from these same bytes. The temporary copy is
 * not read back: unlike a copy from an external file, nothing can change the bytes between hashing and
 * writing, and a failed write rejects. An existing destination is still checked before it is reused.
 */
export async function publishImmutableAttachmentBytes(destination: string, bytesHash: string, bytes: Uint8Array) {
  return publishImmutableAttachment(destination, bytesHash,
    temporary => fs.writeFile(temporary, bytes, { flag: 'wx' }), false);
}

async function verify(file: string, expected: string) {
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(file)) digest.update(bytes);
  if (digest.digest('hex') !== expected) throw new Error('canonical_attachment_hash_mismatch');
}

/** The caller has verified the complete temporary file before publishing it. */
export async function renameVerifiedAttachment(temporary: string, destination: string, expectedHash: string, notify = true) {
  attachmentSourceVerification.invalidate(path.basename(destination));
  try {
    await rename(temporary, destination);
    if (notify) notifyAttachmentPublished(path.basename(destination));
    return true;
  }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || !['EEXIST', 'EPERM'].includes(String(error.code))) throw error;
    await verify(destination, expectedHash);
    await rm(temporary);
    return false;
  }
}
