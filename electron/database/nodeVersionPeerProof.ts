import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';

import { openDatabaseConnection } from './connection.js';

export function loadDesktopLocalNodeProof() {
  const proof = openDatabaseConnection().driver.queryOne<{
    library_epoch: string; proof_revision: number;
  }>('SELECT library_epoch, proof_revision FROM node_version_local_proof_state WHERE singleton_id = 1');
  if (!proof) throw new Error('node_version_local_proof_missing');
  const sourceRevisions = openDatabaseConnection().driver.queryAll<{
    proof_revision: number; source_device_identity_key: string;
  }>('SELECT source_device_identity_key, proof_revision FROM node_version_local_source_revisions');
  return { ...proof, source_proof_revisions: Object.fromEntries(sourceRevisions.map((row) =>
    [row.source_device_identity_key, row.proof_revision])) };
}

export function assertDesktopPeerProofFresh(incoming: SyncGroupMemberStatePayload) {
  const known = openDatabaseConnection().driver.queryOne<{
    library_epoch: string; proof_revision: number;
  }>(`SELECT library_epoch, proof_revision FROM node_version_device_revisions
    WHERE group_id = ? AND device_identity_key = ?`,
  [incoming.group_id, incoming.sender_device_identity_key]);
  const local = openDatabaseConnection().driver.queryOne<{ local_device_identity_key: string }>(
    `SELECT local_device_identity_key FROM sync_group_local_state WHERE singleton_id = 1`
  );
  if (!local) throw new Error('node_version_local_device_missing');
  if (known && (known.library_epoch !== incoming.library_epoch ||
      known.proof_revision > (incoming.source_proof_revisions[local.local_device_identity_key] ?? 0))) {
    throw new Error('node_version_peer_restore_requires_rejoin');
  }
}

export function recordDesktopAcknowledgedPeerProof(
  incoming: SyncGroupMemberStatePayload,
  localDeviceId: string
) {
  if (incoming.source_proof_revisions[localDeviceId] !== incoming.proof_revision) return;
  openDatabaseConnection().driver.execute(
    `INSERT INTO node_version_device_revisions
     (group_id, device_identity_key, library_epoch, proof_revision, pack_id, blocked_reason, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(group_id, device_identity_key) DO UPDATE SET
       library_epoch = excluded.library_epoch, proof_revision = excluded.proof_revision,
       pack_id = excluded.pack_id, updated_at = excluded.updated_at`,
    [incoming.group_id, incoming.sender_device_identity_key, incoming.library_epoch,
      incoming.proof_revision, `framed-round:${incoming.library_epoch}:${incoming.proof_revision}`,
      new Date().toISOString()]
  );
}
