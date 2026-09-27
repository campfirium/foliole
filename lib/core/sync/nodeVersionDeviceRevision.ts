import type { DbPort, DbRow } from './dbPort.js';

interface DeviceRevision extends DbRow {
  blocked_reason: string | null;
  library_epoch: string;
  pack_id: string;
  proof_revision: number;
}

export async function acceptDeviceRevision(port: DbPort, args: {
  confirmedAt: string;
  deviceId: string;
  groupId: string;
  libraryEpoch: string;
  packId: string;
  proofRevision: number;
  results: unknown[];
}) {
  const [known] = await port.query<DeviceRevision>(
    `SELECT library_epoch, proof_revision, pack_id, blocked_reason
     FROM node_version_device_revisions WHERE group_id = ? AND device_identity_key = ?`,
    [args.groupId, args.deviceId]
  );
  if (known?.blocked_reason) return false;
  const old = known && (known.library_epoch !== args.libraryEpoch ||
    known.proof_revision > args.proofRevision ||
    (known.proof_revision === args.proofRevision && known.pack_id !== args.packId));
  if (old) {
    const [row] = await port.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM node_version_pack_receipts WHERE pack_id = ?`, [args.packId]
    );
    if (row?.count === args.results.length && row.count > 0) return true;
    await port.run(
      `UPDATE node_version_device_revisions SET blocked_reason = 'revision_or_epoch_changed', updated_at = ?
       WHERE group_id = ? AND device_identity_key = ?`,
      [args.confirmedAt, args.groupId, args.deviceId]
    );
    return false;
  }
  if (!known || known.proof_revision < args.proofRevision) {
    await port.run(
      `INSERT INTO node_version_device_revisions
       (group_id, device_identity_key, library_epoch, proof_revision, pack_id, blocked_reason, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(group_id, device_identity_key) DO UPDATE SET
         library_epoch = excluded.library_epoch, proof_revision = excluded.proof_revision,
         pack_id = excluded.pack_id, updated_at = excluded.updated_at`,
      [args.groupId, args.deviceId, args.libraryEpoch, args.proofRevision,
        args.packId, args.confirmedAt]
    );
  }
  return true;
}
