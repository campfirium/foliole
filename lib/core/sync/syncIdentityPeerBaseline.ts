import type { DbPort, DbRow } from './dbPort.js';
import { SYNC_IDENTITY_FACT_PROOF_REVISION } from './syncIdentityNodeFactIndex.js';

export interface SyncIdentityPeerBaseline {
  groupId: string;
  localDeviceId: string;
  peerDeviceId: string;
  localEpoch: string;
  peerEpoch: string;
  localWatermark: string;
  peerWatermark: string;
  localViewId: string;
  peerViewId: string;
  localProofRoot: string;
  peerProofRoot: string;
}

export function canReuseSyncIdentityFactProof(baseline: {
  localProofRoot: string; peerProofRoot: string; proofRevision: string;
} | null | undefined, roots: { localProofRoot: string; peerProofRoot: string }) {
  return baseline?.proofRevision === SYNC_IDENTITY_FACT_PROOF_REVISION &&
    /^[a-f0-9]{64}$/u.test(roots.localProofRoot) &&
    /^[a-f0-9]{64}$/u.test(roots.peerProofRoot) &&
    baseline.localProofRoot === roots.localProofRoot &&
    baseline.peerProofRoot === roots.peerProofRoot;
}

export async function loadSyncIdentityPeerBaseline(port: DbPort, pair: {
  groupId: string; localDeviceId: string; peerDeviceId: string;
}) {
  const [row] = await port.query<{ local_epoch: string; peer_epoch: string;
    local_watermark: string; peer_watermark: string; local_proof_root: string;
    peer_proof_root: string; proof_contract_revision: string } & DbRow>(`SELECT baseline.local_epoch,
      baseline.peer_epoch, baseline.local_watermark, baseline.peer_watermark,
      baseline.local_proof_root, baseline.peer_proof_root,
      baseline.proof_contract_revision
    FROM sync_identity_peer_baselines baseline
    JOIN sync_group_local_state local ON local.singleton_id = 1
      AND local.group_id = baseline.group_id AND local.state = 'active'
      AND local.local_device_identity_key = baseline.local_device_id
    JOIN sync_group_devices peer ON peer.group_id = baseline.group_id
      AND peer.device_identity_key = baseline.peer_device_id AND peer.state = 'active'
    WHERE baseline.group_id = ? AND baseline.local_device_id = ?
      AND baseline.peer_device_id = ?`,
  [pair.groupId, pair.localDeviceId, pair.peerDeviceId]);
  return row ? { localEpoch: row.local_epoch, peerEpoch: row.peer_epoch,
    localWatermark: row.local_watermark, peerWatermark: row.peer_watermark,
    localProofRoot: row.local_proof_root, peerProofRoot: row.peer_proof_root,
    proofRevision: row.proof_contract_revision } : null;
}

/** Persist only a completed zero-difference identity and retained-fact check. */
export async function recordSyncIdentityPeerBaseline(port: DbPort,
  baseline: SyncIdentityPeerBaseline) {
  if (![baseline.localProofRoot, baseline.peerProofRoot].every((root) =>
    /^[a-f0-9]{64}$/u.test(root))) throw new Error('sync_identity_baseline_proof_invalid');
  await port.transaction(async (tx) => {
    const [local] = await tx.query<{ group_id: string; local_device_identity_key: string }>(
      `SELECT group_id, local_device_identity_key FROM sync_group_local_state
       WHERE singleton_id = 1 AND state = 'active'`);
    const [peer] = await tx.query<{ state: string }>(`SELECT state FROM sync_group_devices
      WHERE group_id = ? AND device_identity_key = ?`,
    [baseline.groupId, baseline.peerDeviceId]);
    if (local?.group_id !== baseline.groupId ||
        local.local_device_identity_key !== baseline.localDeviceId ||
        peer?.state !== 'active' || baseline.localDeviceId === baseline.peerDeviceId) {
      throw new Error('sync_identity_baseline_pair_invalid');
    }
    await tx.run(`INSERT INTO sync_identity_peer_baselines
      (group_id, local_device_id, peer_device_id, local_epoch, peer_epoch,
       local_watermark, peer_watermark, local_view_id, peer_view_id,
       local_proof_root, peer_proof_root, proof_contract_revision, verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(group_id, local_device_id, peer_device_id) DO UPDATE SET
      local_epoch = excluded.local_epoch, peer_epoch = excluded.peer_epoch,
      local_watermark = excluded.local_watermark,
      peer_watermark = excluded.peer_watermark,
      local_view_id = excluded.local_view_id, peer_view_id = excluded.peer_view_id,
      local_proof_root = excluded.local_proof_root,
      peer_proof_root = excluded.peer_proof_root,
      proof_contract_revision = excluded.proof_contract_revision,
      verified_at = excluded.verified_at`,
    [baseline.groupId, baseline.localDeviceId, baseline.peerDeviceId,
      baseline.localEpoch, baseline.peerEpoch, baseline.localWatermark,
      baseline.peerWatermark, baseline.localViewId,
      baseline.peerViewId, baseline.localProofRoot, baseline.peerProofRoot,
      SYNC_IDENTITY_FACT_PROOF_REVISION, new Date().toISOString()]);
  });
}
