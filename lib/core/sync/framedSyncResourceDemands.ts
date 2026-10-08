import type { DbPort } from './dbPort.js';
import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import { restoreFramedSyncResourceFact } from './framedSyncResourceFact.js';

export type FramedSyncResourceDemandKey = Readonly<{
  groupId: string; receiverDeviceId: string; receiverLibraryEpoch: string;
  globalId: string; versionId: string; bodyHash: string; storageKey: string;
}>;

const keyValues = (key: FramedSyncResourceDemandKey) => [key.groupId, key.receiverDeviceId,
  key.receiverLibraryEpoch, key.globalId, key.versionId, key.bodyHash, key.storageKey];
const keyWhere = `group_id = ? AND receiver_device_id = ? AND receiver_library_epoch = ?
  AND global_id = ? AND version_id = ? AND body_hash = ? AND storage_key = ?`;

/** Call only after checking the actual file against the currently adopted content. */
export async function ensureFramedSyncMissingResourceDemand(
  db: DbPort, key: FramedSyncResourceDemandKey, createId: () => string
) {
  return db.transaction(async (tx) => {
    const row = (await tx.query<{ demand_id: string; state: string }>(
      `SELECT demand_id, state FROM framed_sync_resource_demands WHERE ${keyWhere}`, keyValues(key)))[0];
    if (row?.state === 'pending') return row.demand_id;
    const demandId = createId();
    if (!demandId) throw new Error('framed_sync_resource_demand_id_invalid');
    await tx.run(`INSERT INTO framed_sync_resource_demands
      (group_id, receiver_device_id, receiver_library_epoch, global_id, version_id,
        body_hash, storage_key, demand_id, state, transfer_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL)
      ON CONFLICT (group_id, receiver_device_id, receiver_library_epoch,
        global_id, version_id, body_hash, storage_key) DO UPDATE
      SET demand_id = excluded.demand_id, state = 'pending', transfer_id = NULL,
        request_started = 0, shared_state_hash = NULL`,
    [...keyValues(key), demandId]);
    return demandId;
  });
}

/** Persist before sending; timeout or missing inbound rows cannot undo this intent. */
export async function startFramedSyncResourceDemandRequest(
  db: DbPort, key: FramedSyncResourceDemandKey, demandId: string, sharedStateHash: Uint8Array
) {
  if (sharedStateHash.byteLength !== 32) throw new Error('framed_sync_resource_request_hash_invalid');
  const result = await db.run(`UPDATE framed_sync_resource_demands
    SET request_started = 1, shared_state_hash = ?
    WHERE ${keyWhere} AND demand_id = ? AND state = 'pending'
      AND (request_started = 0 OR shared_state_hash = ?)`,
  [sharedStateHash, ...keyValues(key), demandId, sharedStateHash]);
  if (result.changes !== 1) throw new Error('framed_sync_resource_demand_not_pending');
}

/** The caller's receipt transaction also owns this transition. */
export async function completeFramedSyncResourceDemand(
  tx: DbPort, context: FramedSyncContext, fact: CanonicalFact, transferId: Uint8Array
) {
  const binding = restoreFramedSyncResourceFact(fact);
  const values = keyValues({ groupId: context.groupId,
    receiverDeviceId: context.receiverDeviceId, receiverLibraryEpoch: context.receiverLibraryEpoch,
    ...binding, storageKey: binding.resource.storageKey });
  const row = (await tx.query<{ state: string; transfer_id: Uint8Array | null; shared_state_hash: Uint8Array | null }>(
    `SELECT state, transfer_id, shared_state_hash FROM framed_sync_resource_demands
      WHERE ${keyWhere} AND demand_id = ?`, [...values, binding.demandId]))[0];
  if (!row || row.state === 'no_longer_required') throw new Error('framed_sync_resource_demand_mismatch');
  if (row.shared_state_hash && row.shared_state_hash.some((value, index) => value !== fact.sharedStateHash[index])) {
    throw new Error('framed_sync_resource_demand_hash_mismatch');
  }
  if (row.state === 'verified_present') {
    if (!row.transfer_id || row.transfer_id.length !== transferId.length ||
        row.transfer_id.some((value, index) => value !== transferId[index])) {
      throw new Error('framed_sync_resource_demand_already_completed');
    }
    return;
  }
  const receipt = await tx.query<{ present: number }>(`SELECT 1 AS present FROM framed_sync_receipts
    WHERE transfer_id = ? AND receiver_device_id = ? AND receiver_library_epoch = ?
      AND applied_state_hash = content_id`,
  [transferId, context.receiverDeviceId, context.receiverLibraryEpoch]);
  if (!receipt.length) throw new Error('framed_sync_resource_demand_receipt_missing');
  await tx.run(`UPDATE framed_sync_resource_demands SET state = 'verified_present', transfer_id = ?
    WHERE ${keyWhere} AND demand_id = ?`, [transferId, ...values, binding.demandId]);
}

/** Obsolete references end work without claiming that any attachment was received. */
export async function obsoleteFramedSyncResourceDemand(tx: DbPort, demandId: string) {
  await tx.run(`UPDATE framed_sync_resource_demands SET state = 'no_longer_required'
    WHERE demand_id = ? AND state = 'pending' AND request_started = 0`, [demandId]);
}
