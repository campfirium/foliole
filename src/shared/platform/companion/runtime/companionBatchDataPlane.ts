import {
  applyCompanionAttachmentManifest,
  applyCompanionContentPack,
  type CompanionAttachmentManifestEntry
} from '../../../../../lib/core/sync/companionBatchDataPlane';
import type { CompanionAttachmentResourceSyncPlugin } from '../../companionAttachmentResourceSyncPluginTypes';
import type { CompanionContentBlobSyncPlugin } from '../../companionContentBlobSyncPluginTypes';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';

type ContentDownload = Awaited<ReturnType<CompanionContentBlobSyncPlugin['downloadContentBlobBatch']>>;

export async function commitStagedCompanionContentBatch(
  owner: CapacitorCompanionDatabaseOwner,
  plugin: CompanionContentBlobSyncPlugin,
  download: ContentDownload,
  now = new Date().toISOString()
) {
  if (!download.pack_path) throw new Error('Native content batch did not return a temporary pack path.');
  let committed = false;
  try {
    const result = await owner.runWriter((db) => applyCompanionContentPack(db, {
      failedHashes: download.failed_hashes ?? [], now, packPath: download.pack_path!
    }));
    committed = true;
    return result;
  } finally {
    await plugin.finishContentBlobBatch({ batch_token: download.batch_token, committed });
  }
}

export async function commitStagedCompanionAttachmentBatch(
  owner: CapacitorCompanionDatabaseOwner,
  plugin: CompanionAttachmentResourceSyncPlugin,
  batchToken: string,
  now = new Date().toISOString()
) {
  let committed = false;
  try {
    const staged = await plugin.stageAttachmentResourceBatch({ batch_token: batchToken });
    const entries = staged.manifest.map(toAttachmentManifestEntry);
    const result = await owner.runWriter((db) => applyCompanionAttachmentManifest(db, {
      entries, failedIds: staged.failed_attachment_ids, now
    }));
    committed = true;
    return result;
  } finally {
    await plugin.finishAttachmentResourceBatch({ batch_token: batchToken, committed });
  }
}

function toAttachmentManifestEntry(entry: {
  attachment_id: string;
  content_hash: string;
  size_bytes: number;
  storage_key: string;
}): CompanionAttachmentManifestEntry {
  return {
    attachmentId: entry.attachment_id,
    contentHash: entry.content_hash,
    sizeBytes: entry.size_bytes,
    storageKey: entry.storage_key
  };
}
