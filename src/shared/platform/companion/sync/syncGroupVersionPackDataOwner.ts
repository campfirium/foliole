import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import {
  confirmOutboundNodeVersionPack,
  stageOutboundNodeVersionHolds
} from '../../../../../lib/core/sync/nodeVersionDeliveryProof';
import { parseNodeVersionReceipt } from '../../../../../lib/core/sync/nodeVersionReceiptContract';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

export function confirmVersionPack(payload: Record<string, unknown>) {
  const receipt = parseNodeVersionReceipt(payload.receipt);
  const peerId = requiredText(payload.authenticated_device_id);
  return writer(async (db) => {
    const [local] = await db.query<{ group_id: string; local_device_identity_key: string }>(
      `SELECT group_id, local_device_identity_key FROM sync_group_local_state
       WHERE singleton_id = 1 AND state = 'active'`
    );
    if (!local || receipt.groupId !== local.group_id ||
        receipt.sourceDeviceId !== local.local_device_identity_key || receipt.deviceId !== peerId) {
      throw new Error('node_version_receipt_identity_mismatch');
    }
    await confirmOutboundNodeVersionPack(db, {
      confirmedAt: new Date().toISOString(), deviceId: peerId, groupId: local.group_id,
      libraryEpoch: receipt.libraryEpoch, packId: receipt.packId,
      proofRevision: receipt.proofRevision, results: receipt.results
    });
    return { accepted: true };
  });
}

export function stageVersionPack(payload: Record<string, unknown>) {
  const heads = versionPairs(payload.heads);
  const payloads = versionPairs(payload.payloads);
  return writer((db) => db.transaction(async (tx) => {
    const [local] = await tx.query<{ group_id: string }>(
      `SELECT group_id FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'`
    );
    if (!local) throw new Error('node_version_pack_group_unavailable');
    await stageOutboundNodeVersionHolds(tx, {
      createdAt: new Date().toISOString(), deviceId: requiredText(payload.peer_id),
      groupId: local.group_id, heads, packId: requiredText(payload.pack_id), payloads
    });
    return { staged: true };
  }));
}

function versionPairs(value: unknown) {
  if (!Array.isArray(value)) throw new Error('node_version_pack_pairs_invalid');
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('sync_group_data_object_required');
    }
    const row = Object.fromEntries(Object.entries(entry));
    return { objectId: requiredText(row.object_id), versionId: requiredText(row.version_id) };
  });
}

function writer<T>(task: (db: DbPort) => Promise<T>) {
  return runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter(task));
}

function requiredText(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('sync_group_data_text_required');
  return value.trim();
}
