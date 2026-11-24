import { access } from 'node:fs/promises';
import path from 'node:path';

import { FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { hashAttachmentFile, stageManagedAttachmentFileCopy } from '../attachments/managedAttachmentFileCopy.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { enqueuePdfAttachmentIndexing, markPdfAttachmentIndexPending } from '../database/pdfIndexing.js';
import { isMountedPdf, readPdfIndexState } from '../database/pdfIndexState.js';

function ensureMergedPdfIndex(attachmentId: string) {
  const status = readPdfIndexState(attachmentId)?.status;
  if (status === 'ready' || status === 'pending' || status === 'indexing' || !isMountedPdf(attachmentId)) return;
  markPdfAttachmentIndexPending(attachmentId);
  enqueuePdfAttachmentIndexing(attachmentId);
}

export async function copyLibraryMergeAttachments(keys: readonly string[], directory: string | null) {
  let copied = 0;
  let missing = 0;
  for (const key of keys) {
    const parsed = parseCanonicalAttachmentStorageKey(key);
    if (!parsed) { missing += 1; continue; }
    const target = resolveAttachmentStoragePath(parsed.contentHash, undefined, parsed.mimeType);
    if (await access(target).then(() => true, () => false)) {
      if (parsed.mimeType === 'application/pdf') {
        await runWithDatabaseConnectionOwner(() => ensureMergedPdfIndex(parsed.contentHash));
      }
      continue;
    }
    const source = directory ? path.join(directory, key) : null;
    if (!source || !await access(source).then(() => true, () => false) || await hashAttachmentFile(source) !== parsed.contentHash) {
      missing += 1;
      continue;
    }
    await stageManagedAttachmentFileCopy({ sourcePath: source, contentHash: parsed.contentHash,
      mimeType: parsed.mimeType, originalName: key });
    await runWithDatabaseConnectionOwner(() => {
      openDatabaseConnection().driver.execute(FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL, [parsed.contentHash, 1]);
      if (parsed.mimeType === 'application/pdf') ensureMergedPdfIndex(parsed.contentHash);
    });
    copied += 1;
  }
  return { copied, missing };
}
