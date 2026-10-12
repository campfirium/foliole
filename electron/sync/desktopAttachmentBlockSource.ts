import { promises as fs } from 'node:fs';
import path from 'node:path';

import { ATTACHMENT_BLOCK_BYTES } from '../../lib/core/sync/attachmentBlockReceiver.js';
import type { AttachmentBlockSource } from '../../lib/core/sync/attachmentBlockTransfer.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { withAttachmentFileLease } from '../attachments/attachmentFileLease.js';
import { attachmentTrashDirectory } from '../attachments/attachmentTrashFiles.js';

import { hashResourceFile } from './resourceFileHash.js';

export function createDesktopAttachmentBlockSource(assetsDir: string): AttachmentBlockSource {
  return { withFile(storageKey, consume) {
    const identity = parseCanonicalAttachmentStorageKey(storageKey);
    if (!identity) throw new Error('attachment_storage_key_invalid');
    const canonicalPath = path.join(assetsDir, storageKey);
    return withAttachmentFileLease(canonicalPath, async () => {
      const filePath = await sourcePath(assetsDir, storageKey);
      const handle = await fs.open(filePath, 'r');
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || await hashResourceFile(filePath) !== identity.contentHash) {
          throw new Error('attachment_source_invalid');
        }
        return await consume({ resource: { storageKey, byteLength: stat.size }, async read(offset, length) {
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
        } });
      } finally { await handle.close(); }
    });
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
