import {
  applyCompanionAttachmentManifest,
  type CompanionAttachmentManifestEntry
} from '../../../../../lib/core/sync/companionBatchDataPlane';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { CompanionAttachmentResourceSyncPlugin } from '../../companionAttachmentResourceSyncPluginTypes';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';

export async function commitStagedCompanionAttachmentBatch(
  owner: CapacitorCompanionDatabaseOwner,
  plugin: CompanionAttachmentResourceSyncPlugin,
  batchToken: string,
  now = new Date().toISOString()
) {
  let entered = false;
  try {
    return await owner.runWriter((db) => {
      entered = true;
      return commitStagedCompanionAttachmentBatchInWriter(db, plugin, batchToken, now);
    });
  } catch (error) {
    if (!entered) await plugin.finishAttachmentResourceBatch({ batch_token: batchToken, committed: false });
    throw error;
  }
}

export async function commitStagedCompanionAttachmentBatchInWriter(
  db: DbPort,
  plugin: CompanionAttachmentResourceSyncPlugin,
  batchToken: string,
  now = new Date().toISOString()
) {
  let committed = false;
  try {
    const staged = await plugin.stageAttachmentResourceBatch({ batch_token: batchToken });
    const entries = staged.manifest.map(toAttachmentManifestEntry);
    const result = await applyCompanionAttachmentManifest(db, {
      entries, failedIds: staged.failed_attachment_ids, now
    });
    committed = true;
    return result;
  } finally {
    await plugin.finishAttachmentResourceBatch({ batch_token: batchToken, committed });
  }
}

function toAttachmentManifestEntry(entry: {
  attachment_id: string;
  content_hash: string;
  mime_type: string;
  size_bytes: number;
  storage_key: string;
}): CompanionAttachmentManifestEntry {
  return {
    attachmentId: entry.attachment_id,
    contentHash: entry.content_hash,
    mimeType: entry.mime_type,
    sizeBytes: entry.size_bytes,
    storageKey: entry.storage_key
  };
}
