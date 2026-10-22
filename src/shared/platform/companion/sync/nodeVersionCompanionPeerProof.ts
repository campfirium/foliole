import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { assertNodeVersionPeerProofFresh } from '../../../../../lib/core/sync/nodeVersionPeerProof';
import { reconcileAdoptedPeerEpoch } from '../../../../../lib/core/sync/syncGroupAdoptedPeerEpoch';
import { loadSyncGroupCoverage } from '../../../../../lib/core/sync/syncGroupCoverageStore';
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
  await reconcileAdoptedPeerEpoch(db, incoming);
  const [known] = await db.query<{ library_epoch: string; proof_revision: number }>(
    `SELECT library_epoch, proof_revision FROM node_version_device_revisions
     WHERE group_id = ? AND device_identity_key = ?`,
    [incoming.group_id, incoming.sender_device_identity_key]
  );
  const coverage = await loadSyncGroupCoverage(db, incoming.group_id);
  const recovered = assertNodeVersionPeerProofFresh(known, incoming, localDeviceId, coverage);
  if (recovered === null) return;
  await db.run(
    `UPDATE node_version_device_revisions SET proof_revision = ?, pack_id = ?, updated_at = ?
     WHERE group_id = ? AND device_identity_key = ?`,
    [recovered, `peer-rollback:${incoming.library_epoch}:${recovered}`, new Date().toISOString(),
      incoming.group_id, incoming.sender_device_identity_key]
  );
}
