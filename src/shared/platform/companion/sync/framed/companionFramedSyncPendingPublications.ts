import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { expireFramedSyncFileCompletions } from '../../../../../../lib/core/sync/framedSyncFileCompletionRetention.js';
import { releaseFramedSyncFilePublication } from '../../../../../../lib/core/sync/framedSyncFileOutbound.js';
import type { FramedSyncFilePort } from '../../../../../../lib/core/sync/framedSyncFilePort.js';
import { discardFramedSyncFilePreparations } from '../../../../../../lib/core/sync/framedSyncFilePreparation.js';
import { streamFramedSyncFilePublications, loadFramedSyncFileTask } from '../../../../../../lib/core/sync/framedSyncFilePublication.js';
import { reconcileFramedSyncFilePublication, selectFramedSyncFileRecoveryPublication, completeFramedSyncFileRecovery } from '../../../../../../lib/core/sync/framedSyncFileRecovery.js';
import type { FramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncMissingDependency } from '../../../../../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { isSyncGroupPeerAdopting, syncGroupLocalPublicationBlockReason } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import type { NativeCompanionFramedSyncInventoryRequest } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

import { currentCompanionFramedSyncFiles } from './companionFramedSyncFiles.js';
import { decodeCompanionInventoryEntry } from './companionFramedSyncInventoryEntryDecode.js';

export function readCompanionFramedSyncPendingPublications(
  db: DbPort, args: NativeCompanionFramedSyncInventoryRequest, files?: FramedSyncFilePort
) {
  if (files) return readFilePublications(db, args, files);
  return db.query<{ object_id: string; object_type: string; state: string; transfer_id: string }>(
    `SELECT lower(hex(p.transfer_id)) AS transfer_id, p.state,
       (SELECT global_id FROM framed_sync_outbound_fact_refs f
        WHERE f.transfer_id = p.transfer_id ORDER BY rowid LIMIT 1) AS object_id,
       (SELECT object_type FROM framed_sync_outbound_fact_refs f
        WHERE f.transfer_id = p.transfer_id ORDER BY rowid LIMIT 1) AS object_type
     FROM framed_sync_outbound_publications p
     JOIN framed_sync_outbound_holds h ON h.transfer_id = p.transfer_id
     JOIN sync_group_local_state local ON local.singleton_id = 1 AND local.state = 'active'
       AND local.group_id = p.group_id AND local.local_device_identity_key = p.sender_device_id
     JOIN node_version_local_proof_state proof ON proof.singleton_id = 1
       AND proof.library_epoch = p.sender_library_epoch
     WHERE p.group_id = ? AND p.receiver_device_id = ? AND p.receiver_library_epoch = ?
       AND h.member_id = p.receiver_device_id AND p.state IN ('published', 'receipt_committed')
     ORDER BY p.rowid`,
    [args.sync_group_id, args.receiver_device_id, args.receiver_library_epoch]);
}

async function readFilePublications(db: DbPort, args: NativeCompanionFramedSyncInventoryRequest, files: FramedSyncFilePort) {
  const [local] = await db.query<{ device: string; epoch: string }>(`SELECT state.local_device_identity_key AS device,
    proof.library_epoch AS epoch FROM sync_group_local_state state JOIN node_version_local_proof_state proof
    ON proof.singleton_id = 1 WHERE state.singleton_id = 1 AND state.state = 'active' AND state.group_id = ?`, [args.sync_group_id]);
  if (!local) return [];
  const result = [];
  for await (const publication of streamFramedSyncFilePublications(files)) {
    const context = publication.context;
    if (context.groupId !== args.sync_group_id || context.senderDeviceId !== local.device || context.senderLibraryEpoch !== local.epoch ||
        context.receiverDeviceId !== args.receiver_device_id || context.receiverLibraryEpoch !== args.receiver_library_epoch) continue;
    const first = publication.manifest.facts[0];
    if (!first) throw new Error('framed_sync_outbound_fact_set_empty');
    const task = await loadFramedSyncFileTask(files, publication.transferId);
    result.push({ object_id: first.globalId, object_type: first.objectType,
      transfer_id: bytesToHex(publication.transferId), state: task?.state === 'confirmed' ? 'receipt_committed' : 'published' });
  }
  return result;
}

/** Failed delivery is compared again before the native sender is invoked. */
export async function resumeCompanionFramedSyncPendingPublications(
  args: NativeCompanionFramedSyncInventoryRequest,
  remoteInventory?: readonly FramedSyncInventoryEntry[]
) {
  const owner = getIosCompanionDatabaseOwner();
  const files = currentCompanionFramedSyncFiles();
  await discardFramedSyncFilePreparations(files);
  await expireFramedSyncFileCompletions(files);
  if (await owner.read(syncGroupLocalPublicationBlockReason) || await owner.read((db) =>
    isSyncGroupPeerAdopting(db, args.sync_group_id, args.receiver_device_id))) return 0;
  const pending = await owner.read((db) => readCompanionFramedSyncPendingPublications(db, args, files));
  if (!pending.length) return 0;
  const remote = remoteInventory ?? (await FolioleCompanionSync.readFramedSyncInventory(args))
    .entries.map(decodeCompanionInventoryEntry);
  for (const publication of pending) {
    if (publication.state === 'receipt_committed') {
      await runCompanionSyncWriterTask(() => owner.runWriter(async () => {
        const transferId = hexToBytes(publication.transfer_id);
        await releaseFramedSyncFilePublication(files, transferId);
      }));
    } else {
      const state = await runCompanionSyncWriterTask(() => owner.runWriter(() =>
        reconcileFramedSyncFilePublication(files, hexToBytes(publication.transfer_id), remote)));
      if (state === 'satisfied') {
        await runCompanionSyncWriterTask(() => owner.runWriter(() =>
          releaseFramedSyncFilePublication(files, hexToBytes(publication.transfer_id))));
        continue;
      }
      const recovery = await runCompanionSyncWriterTask(() => owner.runWriter(() =>
        selectFramedSyncFileRecoveryPublication(files, hexToBytes(publication.transfer_id), remote)));
      const recoveryId = bytesToHex(recovery.transferId);
      const receipt = await sendRecovery(args, publication, recoveryId);
      if (!receipt) continue;
      if (receipt.transfer_id !== recoveryId ||
          receipt.receiver_device_id !== args.receiver_device_id ||
          receipt.receiver_library_epoch !== args.receiver_library_epoch) {
        throw new Error('framed_sync_transfer_receipt_invalid');
      }
      await runCompanionSyncWriterTask(() => owner.runWriter(() =>
        completeFramedSyncFileRecovery(files, hexToBytes(publication.transfer_id), recovery.transferId)));
      await runCompanionSyncWriterTask(() => owner.runWriter(() =>
        releaseFramedSyncFilePublication(files, hexToBytes(publication.transfer_id))));
    }
  }
  return pending.length;
}

async function sendRecovery(args: NativeCompanionFramedSyncInventoryRequest,
  publication: { object_id: string; object_type: string }, transferId: string) {
  try {
    return await FolioleCompanionSync.sendFramedSyncTransfer({ ...args,
      include_current_node: false, object_id: publication.object_id, object_type: publication.object_type,
      required_relation_ids: [], review_fact_ids: [], state_fact_ids: [], transfer_id: transferId });
  } catch (error) {
    if (readFramedSyncMissingDependency(error)) return null;
    throw error;
  }
}
