import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { ATTACHMENT_BLOCK_BYTES } from '../../lib/core/sync/attachmentBlockReceiver.js';
import type { AttachmentBlockSource, AttachmentSourceFile, AttachmentSourceOptions } from '../../lib/core/sync/attachmentBlockTransfer.js';
import { attachmentSourceVerification } from '../../lib/core/sync/attachmentSourceVerification.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { withAttachmentFileLease } from '../attachments/attachmentFileLease.js';
import { attachmentTrashDirectory } from '../attachments/attachmentTrashFiles.js';


export function createDesktopAttachmentBlockSource(assetsDir: string, libraryIdentity: string): AttachmentBlockSource {
  return { withFile(storageKey, consume, options) {
    const identity = parseCanonicalAttachmentStorageKey(storageKey);
    if (!identity) throw new Error('attachment_storage_key_invalid');
    const canonicalPath = path.join(assetsDir, storageKey);
    return withAttachmentFileLease(canonicalPath, async () => {
      const filePath = await sourcePath(assetsDir, storageKey);
      const handle = await fs.open(filePath, 'r');
      try {
        const stat = await handle.stat();
        if (!stat.isFile()) {
          throw new Error('attachment_source_invalid');
        }
        const file = { resource: { storageKey, byteLength: stat.size }, async read(offset: number, length: number) {
          if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 ||
              length < 0 || length > ATTACHMENT_BLOCK_BYTES || offset + length > stat.size) {
            throw new Error('attachment_source_range_invalid');
          }
          const bytes = new Uint8Array(length);
          let read = 0;
          while (read < length) {
            const result = await handle.read(bytes, read, length - read, offset + read);
            if (!result.bytesRead) throw new Error('attachment_source_truncated');
            read += result.bytesRead;
          }
          return bytes;
        } };
        const small = stat.size > 0 && stat.size <= ATTACHMENT_BLOCK_BYTES && !storageKey.endsWith('.pdftext');
        if (small && options?.describeSmallFile) {
          return await consume({ resource: file.resource, async read() { throw new Error('attachment_description_only'); } });
        }
        if (small && options?.snapshot && !options.shouldYield()) {
          const { budget, byteLength } = options.snapshot;
          if (byteLength !== stat.size) throw new Error('attachment_pull_range_invalid');
          const reserved = budget.tryAcquireAttachmentSnapshot(stat.size);
          if (reserved) {
            try { return await consume(await readAttachmentSnapshot(file, identity.contentHash, options.shouldYield)); }
            finally { reserved.release(); }
          }
        }
        const verified = await attachmentSourceVerification.verify(libraryIdentity, file, options?.shouldYield, () => createHash('sha256'));
        return await consume(verified);
      } finally { await handle.close(); }
    });
  } };
}

async function readAttachmentSnapshot(file: AttachmentSourceFile, expected: string,
  checkCancellation: AttachmentSourceOptions['shouldYield']): Promise<AttachmentSourceFile> {
  const bytes = await file.read(0, file.resource.byteLength);
  checkCancellation(); // A completed single block can finish its window.
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('attachment_source_invalid');
  return { resource: file.resource, snapshot: true, async read(offset, length) {
    if (offset !== 0 || length !== bytes.byteLength) throw new Error('attachment_source_range_invalid');
    return bytes;
  } };
}

async function sourcePath(assetsDir: string, storageKey: string) {
  if (!parseCanonicalAttachmentStorageKey(storageKey)) throw new Error('attachment_storage_key_invalid');
  for (const directory of [assetsDir, attachmentTrashDirectory(assetsDir)]) {
    const file = path.join(directory, storageKey);
    try {
      if (!(await fs.lstat(file)).isFile()) throw new Error('attachment_source_invalid');
      return file;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
  }
  throw Object.assign(new Error('attachment_source_missing'), { code: 'ENOENT' });
}

export async function isDesktopAttachmentPresent(assetsDir: string, storageKey: string) {
  try { await sourcePath(assetsDir, storageKey); return true; }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}
