import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { SyncGroupMemberStatePayload } from '../../../../../lib/platform/syncGroupMemberStateContract';

export async function loadCompanionLocalNodeProof(db: DbPort) {
  const [proof] = await db.query<{ library_epoch: string; proof_revision: number }>(
    'SELECT library_epoch, proof_revision FROM node_version_local_proof_state WHERE singleton_id = 1'
  );
  if (!proof) throw new Error('node_version_local_proof_missing');
  const sourceRevisions = await db.query<{
    proof_revision: number; source_device_identity_key: string;
  }>('SELECT source_device_identity_key, proof_revision FROM node_version_local_source_revisions');
  return { ...proof, source_proof_revisions: Object.fromEntries(sourceRevisions.map((row) =>
    [row.source_device_identity_key, row.proof_revision])) };
}

export async function assertCompanionPeerProofFresh(
  db: DbPort, incoming: SyncGroupMemberStatePayload, localDeviceId: string
) {
  const [known] = await db.query<{ library_epoch: string; proof_revision: number }>(
    `SELECT library_epoch, proof_revision FROM node_version_device_revisions
     WHERE group_id = ? AND device_identity_key = ?`,
    [incoming.group_id, incoming.sender_device_identity_key]
  );
  if (known && (known.library_epoch !== incoming.library_epoch ||
      known.proof_revision > (incoming.source_proof_revisions[localDeviceId] ?? 0))) {
    throw new Error('node_version_peer_restore_requires_rejoin');
  }
}
