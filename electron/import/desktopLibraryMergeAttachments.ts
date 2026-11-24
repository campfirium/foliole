import { lstat } from 'node:fs/promises';
import path from 'node:path';

import { FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { readAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { hashAttachmentFile, stageManagedAttachmentFileCopy } from '../attachments/managedAttachmentFileCopy.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { ensurePdfAttachmentIndexing } from '../database/pdfIndexing.js';

export function captureLibraryMergeTarget() {
  return { connection: openDatabaseConnection(), assetsDir: readAttachmentLibraryPathSnapshot()?.assetsDir };
}

export type LibraryMergeTarget = ReturnType<typeof captureLibraryMergeTarget>;

export function withLibraryMergeTarget<T>(target: LibraryMergeTarget, run: () => Promise<T> | T) {
  return runWithDatabaseConnectionOwner(() => {
    if (openDatabaseConnection() !== target.connection || readAttachmentLibraryPathSnapshot()?.assetsDir !== target.assetsDir) {
      throw new Error('library_merge_target_changed');
    }
    return run();
  });
}

function registerAttachment(target: LibraryMergeTarget, contentHash: string, mimeType: string) {
  return withLibraryMergeTarget(target, () => {
    target.connection.driver.execute(FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL, [contentHash, 1]);
    if (mimeType === 'application/pdf') ensurePdfAttachmentIndexing(contentHash);
  });
}

async function matchesAttachmentHash(file: string, contentHash: string) {
  return await hashAttachmentFile(file).catch(() => null) === contentHash;
}

async function recoverExistingAttachment(target: LibraryMergeTarget, file: string, contentHash: string, mimeType: string) {
  const available = await withLibraryMergeTarget(target, () => {
    const row = target.connection.driver.queryOne<{ available: number }>(
      'SELECT available FROM framed_sync_resource_availability WHERE hash = ?', [contentHash]);
    if (row?.available !== 1) return false;
    if (mimeType === 'application/pdf') ensurePdfAttachmentIndexing(contentHash);
    return true;
  });
  if (available) return true;
  if (!await matchesAttachmentHash(file, contentHash)) return false;
  await registerAttachment(target, contentHash, mimeType);
  return true;
}

export async function copyLibraryMergeAttachments(keys: readonly string[], directory: string | null, target: LibraryMergeTarget) {
  if (!keys.length) return withLibraryMergeTarget(target, () => ({ copied: 0, missing: 0 }));
  const { assetsDir } = target;
  if (!assetsDir) throw new Error('attachment library path snapshot is unavailable');
  let copied = 0;
  let missing = 0;
  for (const key of keys) {
    const parsed = parseCanonicalAttachmentStorageKey(key);
    if (!parsed) { missing += 1; continue; }
    const file = resolveAttachmentStoragePath(parsed.contentHash, assetsDir, parsed.mimeType);
    const targetFile = await lstat(file).catch(() => null);
    if (targetFile) {
      if (!targetFile.isFile() || !await recoverExistingAttachment(target, file, parsed.contentHash, parsed.mimeType)) missing += 1;
      continue;
    }
    const source = directory ? path.join(directory, key) : null;
    if (!source || !await matchesAttachmentHash(source, parsed.contentHash)) {
      missing += 1;
      continue;
    }
    await withLibraryMergeTarget(target, () => undefined);
    await stageManagedAttachmentFileCopy({ assetsDir, sourcePath: source, contentHash: parsed.contentHash,
      mimeType: parsed.mimeType, originalName: key });
    await registerAttachment(target, parsed.contentHash, parsed.mimeType);
    copied += 1;
  }
  return withLibraryMergeTarget(target, () => ({ copied, missing }));
}
