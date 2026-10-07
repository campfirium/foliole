import { collectBodyContentCandidates } from '../../lib/core/database/bodyContentCollection.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { finishSyncGroupLocalAdoption, type SyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadLatestSyncGroupRestoreEvent, markSyncGroupRestoreApplied } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { clearWorkgroupSyncDataForRestore } from '../../lib/core/sync/syncGroupRestoreReset.js';

export type VerifiedRestoreInput = Readonly<{
  adoption?: SyncGroupLocalAdoption;
  restore?: Readonly<{ groupId: string; restoreId: string }>;
}>;

export async function prepareVerifiedDesktopFramedRestore(tx: DbPort, input: VerifiedRestoreInput) {
  const removedNodes = input.adoption || input.restore ? await tx.query<{ id: string }>('SELECT id FROM nodes') : [];
  if (input.adoption) await clearWorkgroupSyncDataForRestore(tx, input.adoption.libraryEpoch, 'chunked');
  const latest = input.restore ? await loadLatestSyncGroupRestoreEvent(tx, input.restore.groupId) : null;
  if (input.restore) {
    if (!latest || latest.event.restore_id !== input.restore.restoreId || latest.applied) {
      throw new Error('framed_sync_restore_state_invalid');
    }
    await clearWorkgroupSyncDataForRestore(tx, input.restore.restoreId, 'chunked');
  }
  return { removedNodeIds: removedNodes.map((node) => node.id), latest };
}

export async function finishVerifiedDesktopFramedRestore(tx: DbPort, input: VerifiedRestoreInput,
  prepared: Awaited<ReturnType<typeof prepareVerifiedDesktopFramedRestore>>) {
  if (prepared.latest) await markSyncGroupRestoreApplied(tx, prepared.latest.event);
  if (input.adoption) await finishSyncGroupLocalAdoption(tx, input.adoption);
}

/** Run only after restored business references and receipts own their adopted bodies. */
export async function collectVerifiedDesktopFramedRestoreBodies(tx: DbPort) {
  let after = '';
  for (;;) {
    const rows: { hash: string }[] = await tx.query<{ hash: string }>(
      "SELECT hash FROM content_blobs WHERE kind = 'text_body' AND hash > ? ORDER BY hash LIMIT 1", [after]);
    const row = rows[0];
    if (!row) return;
    await collectBodyContentCandidates(tx, [row.hash]);
    after = row.hash;
  }
}
