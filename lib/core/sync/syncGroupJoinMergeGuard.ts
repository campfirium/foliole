import { parseSyncGroupJoinRequestInput } from '../../platform/syncGroupJoinContract.js';
import { SYNC_GROUP_MERGE_REQUIRES_OVERWRITE } from '../../platform/syncGroupJoinMergeProof.js';
import { createSyncGroupDeviceIdentity } from '../../platform/syncGroupUnifiedContract.js';

import type { DbPort } from './dbPort.js';

// Admission is read-only. Normal member-state checks still protect every later exchange.
export async function assertSyncGroupJoinMergeAllowed(db: DbPort, input: unknown) {
  const request = parseSyncGroupJoinRequestInput(input);
  const [local] = await db.query<{ group_id: string; local_device_identity_key: string }>(
    `SELECT group_id, local_device_identity_key FROM sync_group_local_state
     WHERE singleton_id = 1 AND state = 'active'`
  );
  if (!local || local.group_id !== request.group_id) throw new Error('sync_group_identity_mismatch');
  if (!request.merge_proof) return;
  const device = createSyncGroupDeviceIdentity({
    device_anchor: request.device.device_anchor, group_id: request.group_id,
    library_path: request.device.canonical_library_path, path_flavor: request.device.path_flavor
  });
  const [known] = await db.query<{ library_epoch: string; proof_revision: number }>(
    `SELECT library_epoch, proof_revision FROM node_version_device_revisions
     WHERE group_id = ? AND device_identity_key = ?`, [request.group_id, device.identity_key]
  );
  if (known && (known.library_epoch !== request.merge_proof.library_epoch ||
      known.proof_revision > (request.merge_proof.source_proof_revisions[local.local_device_identity_key] ?? 0))) {
    throw new Error(SYNC_GROUP_MERGE_REQUIRES_OVERWRITE);
  }
}
