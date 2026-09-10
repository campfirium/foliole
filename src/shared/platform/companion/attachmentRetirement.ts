import { recordAttachmentRetirementObligation } from '../../../../lib/core/sync/attachmentRetirementObligation';
import type { DbPort } from '../../../../lib/core/sync/dbPort';
import { parseAttachmentSyncTombstone } from '../../../../lib/platform/attachmentSyncTombstone';
import type { NativeSyncObjectRecord } from '../../../../lib/platform/nativeSyncContract';
import { FolioleCompanionSync } from '../companionWorkspaceRuntimeRepository';

export interface CompanionAttachmentRetirementBatch {
  journal_token: string;
  library_scope: string;
  tombstones: ReturnType<typeof parseAttachmentSyncTombstone>[];
}

export async function prepareCompanionAttachmentRetirement(records: NativeSyncObjectRecord[], libraryScope: string) {
  const tombstones = records.flatMap((record) => {
    if (record.object_type !== 'attachment' || !record.deleted_at) return [];
    const tombstone = parseAttachmentSyncTombstone(JSON.parse(record.payload_json ?? 'null'));
    if (tombstone.attachment_id !== record.object_id) throw new Error('Attachment tombstone identity mismatch.');
    return [tombstone];
  });
  if (!tombstones.length) return null;
  const batch = await FolioleCompanionSync.prepareAttachmentRetirement({ library_scope: libraryScope, tombstones });
  return { ...batch, library_scope: libraryScope, tombstones };
}

export async function recordCompanionAttachmentRetirement(
  db: DbPort,
  batch: CompanionAttachmentRetirementBatch | null,
  stage: 'database_committed' | 'verified' | 'finalized'
) {
  if (!batch) return;
  await recordAttachmentRetirementObligation(db, {
    items: batch.tombstones,
    journalToken: batch.journal_token,
    libraryScope: batch.library_scope
  }, stage);
}

export async function confirmCompanionAttachmentRetirement(db: DbPort, batch: CompanionAttachmentRetirementBatch | null) {
  if (!batch) return true;
  for (const tombstone of batch.tombstones) {
    const rows = await db.query(
      `SELECT 1 AS present FROM attachment_sync_tombstones
       WHERE attachment_id = ? AND content_hash = ? AND storage_key = ? AND mime_type = ?`,
      [tombstone.attachment_id, tombstone.content_hash, tombstone.storage_key, tombstone.mime_type]
    );
    if (!rows.length) return false;
  }
  return true;
}

export async function finishCompanionAttachmentRetirement(
  batch: CompanionAttachmentRetirementBatch | null,
  committed: boolean
) {
  if (!batch) return;
  await FolioleCompanionSync.finishAttachmentRetirement({
    committed,
    journal_token: batch.journal_token
  });
}

export async function finalizeCompanionAttachmentRetirement(
  db: DbPort,
  batch: CompanionAttachmentRetirementBatch
) {
  await FolioleCompanionSync.finalizeAttachmentRetirement({ journal_token: batch.journal_token });
  await recordCompanionAttachmentRetirement(db, batch, 'finalized');
}
