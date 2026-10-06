import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { TransferReceiptStage } from '../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { assertFramedSyncNodeParentDependencies } from '../../lib/core/sync/framedSyncNodeParentDependencies.js';
import { recordFramedSyncPeerEpoch } from '../../lib/core/sync/framedSyncPeerEpoch.js';
import { advanceLocalSourceRevision } from '../../lib/core/sync/nodeVersionInboundReceipt.js';
import {
  loadLatestSyncGroupRestoreEvent,
  markSyncGroupRestoreApplied
} from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { clearWorkgroupSyncDataForRestore } from '../../lib/core/sync/syncGroupRestoreReset.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { applyDesktopFramedSyncRelationReviewFactsWithDbPort } from '../database/desktopFramedSyncRelationReviewApply.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';

import type { PreparedDesktopFramedSyncInbound } from './desktopFramedSyncPreparedInbound.js';

export async function applyPreparedDesktopFramedSyncInbound(input: {
  db: DbPort;
  restore?: Readonly<{ groupId: string; restoreId: string }>;
  transfers: readonly PreparedDesktopFramedSyncInbound[];
}) {
  const receipts = await input.db.transaction(async (tx) => {
    const restore = input.restore ? await prepareRestore(tx, input.restore) : null;
    const records = input.transfers.flatMap((transfer) => transfer.records);
    await assertFramedSyncNodeParentDependencies(tx, records);
    if (records.length) {
      await promoteFramedNodeBodies(tx, records);
      await applySyncNodesWithDbPort(tx, records);
    }
    await applyDesktopFramedSyncRelationReviewFactsWithDbPort(
      tx, input.transfers.flatMap((transfer) => transfer.relationReviewFacts)
    );
    for (const record of input.transfers.flatMap((transfer) => transfer.stateRecords)) {
      await applySyncObjectInTransaction(tx, record);
    }
    await recordSourceProgress(tx, input.transfers);
    if (restore) await markSyncGroupRestoreApplied(tx, restore.event);
    return Promise.all(input.transfers.map((transfer) => createReceipt(tx, transfer)));
  });
  await Promise.all(input.transfers.map((transfer) =>
    transfer.staging.releasePins(transfer.transferId, 'business_reference_committed')));
  return receipts;
}

async function prepareRestore(
  tx: DbPort,
  restore: Readonly<{ groupId: string; restoreId: string }>
) {
  const latest = await loadLatestSyncGroupRestoreEvent(tx, restore.groupId);
  if (!latest || latest.event.restore_id !== restore.restoreId || latest.applied) {
    throw new Error('framed_sync_restore_state_invalid');
  }
  await clearWorkgroupSyncDataForRestore(tx, restore.restoreId);
  return latest;
}

async function recordSourceProgress(
  tx: DbPort,
  transfers: readonly PreparedDesktopFramedSyncInbound[]
) {
  const senders = new Set<string>();
  for (const transfer of transfers) {
    if (!senders.has(transfer.context.senderDeviceId)) {
      await advanceLocalSourceRevision(tx, transfer.context.senderDeviceId);
      senders.add(transfer.context.senderDeviceId);
    }
    await recordFramedSyncPeerEpoch(tx, {
      groupId: transfer.context.groupId,
      libraryEpoch: transfer.context.senderLibraryEpoch,
      peerDeviceId: transfer.context.senderDeviceId,
      transferId: transfer.transferId
    });
  }
}

async function createReceipt(
  tx: DbPort,
  transfer: PreparedDesktopFramedSyncInbound
): Promise<TransferReceiptStage> {
  const appliedStateHash = (await readFramedSyncInventoryEntry(tx, {
    globalId: transfer.globalId, objectType: 'node'
  }))?.sharedStateHash;
  if (!appliedStateHash) throw new Error('framed_sync_process_inventory_missing');
  return createDesktopFramedSyncStaging(tx).commitApplyAndReceipt({
    appliedStateHash,
    contentId: transfer.manifestHash,
    receiverDeviceId: transfer.context.receiverDeviceId,
    receiverLibraryEpoch: transfer.context.receiverLibraryEpoch,
    transferId: transfer.transferId
  });
}

async function promoteFramedNodeBodies(
  db: DbPort,
  records: readonly NativeSyncNodeRecord[]
) {
  for (const record of records) {
    const hash = record.snapshot.body_blob_hash;
    if (!hash || record.body_text === null) {
      throw new Error('framed_sync_node_body_projection_missing');
    }
    await upsertTextBodyBlob(db, record.body_text, record.updated_at, hash);
  }
}
