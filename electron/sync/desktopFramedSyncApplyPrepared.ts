import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { TransferReceiptStage } from '../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { assertFramedSyncNodeParentDependencies } from '../../lib/core/sync/framedSyncNodeParentDependencies.js';
import { readFramedSyncNodeResources } from '../../lib/core/sync/framedSyncNodeResources.js';
import { applyFramedSyncObjectStateRecord } from '../../lib/core/sync/framedSyncObjectStateFact.js';
import { recordFramedSyncPeerEpoch } from '../../lib/core/sync/framedSyncPeerEpoch.js';
import { advanceLocalSourceRevision } from '../../lib/core/sync/nodeVersionInboundReceipt.js';
import {
  loadLatestSyncGroupRestoreEvent,
  markSyncGroupRestoreApplied
} from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { clearWorkgroupSyncDataForRestore } from '../../lib/core/sync/syncGroupRestoreReset.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { isNodeVersionIdentityOnly } from '../../lib/core/sync/syncNodeVersionHistory.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { applyDesktopFramedSyncRelationReviewFactsWithDbPort } from '../database/desktopFramedSyncRelationReviewApply.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { materializeDesktopSettingRecord, readDesktopHostName } from '../database/desktopSettingMaterializer.js';

import type { PreparedDesktopFramedSyncInbound } from './desktopFramedSyncPreparedInbound.js';

export async function applyPreparedDesktopFramedSyncInbound(input: {
  db: DbPort;
  restore?: Readonly<{ groupId: string; restoreId: string }>;
  transfers: readonly PreparedDesktopFramedSyncInbound[];
}) {
  const applied = await input.db.transaction(async (tx) => {
    const restore = input.restore ? await prepareRestore(tx, input.restore) : null;
    const records = input.transfers.flatMap((transfer) => transfer.records);
    await recordFramedSyncResourceAvailability(tx, records.filter((record) => !isNodeVersionIdentityOnly(record)).flatMap((record) =>
      readFramedSyncNodeResources(record.snapshot.resource_references).map((resource) => resource.contentHash)), true);
    let generatedChanges = false;
    await assertFramedSyncNodeParentDependencies(tx, records);
    if (records.length) {
      await promoteFramedNodeBodies(tx, records);
      if (restore) {
        await applySyncNodesWithDbPort(tx, records, { operation: 'local_restore' });
      } else {
        const result = await applyConvergentSyncNodesWithDbPort(tx, records);
        generatedChanges = result.handledConflictCount > 0;
      }
    }
    await applyDesktopFramedSyncRelationReviewFactsWithDbPort(
      tx, input.transfers.flatMap((transfer) => transfer.relationReviewFacts)
    );
    for (const body of input.transfers.flatMap((transfer) => transfer.externalBodies ?? [])) {
      await upsertTextBodyBlob(tx, body.text, new Date().toISOString(), body.hash);
    }
    const stateRecords = input.transfers.flatMap((transfer) => transfer.stateRecords);
    const hostName = stateRecords.some((record) => record.object_type === 'setting')
      ? await readDesktopHostName(tx) : null;
    for (const record of stateRecords) {
      await applyFramedSyncObjectStateRecord(tx, record, {
        ...(hostName ? { hostName } : {}),
        onPayloadAppliedInTransaction: materializeDesktopSettingRecord
      });
    }
    await recordSourceProgress(tx, input.transfers);
    if (restore) await markSyncGroupRestoreApplied(tx, restore.event);
    const receipts = await Promise.all(input.transfers.map((transfer) =>
      createReceipt(tx, transfer)));
    return { generatedChanges, receipts };
  });
  await Promise.all(input.transfers.map((transfer) =>
    transfer.staging.releasePins(transfer.transferId, 'business_reference_committed')));
  return applied;
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
    globalId: transfer.globalId, objectType: transfer.objectType
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
    if (isNodeVersionIdentityOnly(record)) continue;
    const hash = record.snapshot.body_blob_hash;
    if (!hash || typeof record.body_text !== 'string') {
      throw new Error('framed_sync_node_body_projection_missing');
    }
    await upsertTextBodyBlob(db, record.body_text, record.updated_at, hash);
  }
}
