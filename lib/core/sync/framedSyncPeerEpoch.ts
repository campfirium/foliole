import type { DbPort } from './dbPort.js';

export async function recordFramedSyncPeerEpoch(port: DbPort, input: {
  groupId: string;
  libraryEpoch: string;
  peerDeviceId: string;
  transferId: Uint8Array;
}) {
  const [known] = await port.query<{ library_epoch: string; proof_revision: number }>(
    `SELECT library_epoch, proof_revision FROM node_version_device_revisions
     WHERE group_id = ? AND device_identity_key = ?`,
    [input.groupId, input.peerDeviceId]
  );
  if (known) return;
  await port.run(
    `INSERT INTO node_version_device_revisions
     (group_id, device_identity_key, library_epoch, proof_revision, pack_id, blocked_reason, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(group_id, device_identity_key) DO UPDATE SET
       proof_revision = excluded.proof_revision, pack_id = excluded.pack_id,
       updated_at = excluded.updated_at`,
    [input.groupId, input.peerDeviceId, input.libraryEpoch, 0,
      Buffer.from(input.transferId).toString('hex'), new Date().toISOString()]
  );
}
