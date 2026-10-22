import { assertNodeVersionPeerProofFresh } from '../../lib/core/sync/nodeVersionPeerProof.js';
import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';

import { openDatabaseConnection } from './connection.js';
import { loadDesktopSyncGroupCoverage } from './syncGroupCoverageDesktop.js';

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
  const coverage = loadDesktopSyncGroupCoverage(openDatabaseConnection().driver, incoming.group_id);
  const recovered = assertNodeVersionPeerProofFresh(known, incoming, local.local_device_identity_key, coverage);
  if (recovered === null) return;
  console.warn('[sync-group] peer lost acknowledged commits; continuing from its durable revision', {
    peerDeviceId: incoming.sender_device_identity_key, known: known?.proof_revision, recovered
  });
  openDatabaseConnection().driver.execute(
    `UPDATE node_version_device_revisions SET proof_revision = ?, pack_id = ?, updated_at = ?
     WHERE group_id = ? AND device_identity_key = ?`,
    [recovered, `peer-rollback:${incoming.library_epoch}:${recovered}`, new Date().toISOString(),
      incoming.group_id, incoming.sender_device_identity_key]
  );
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
