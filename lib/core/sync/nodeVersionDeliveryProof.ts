import type { DbPort, DbRow } from './dbPort.js';
import { isConsumedNodeVersionConfirmation, saveNodeVersionConfirmationState } from './nodeVersionConfirmationState.js';
import { acceptDeviceRevision } from './nodeVersionDeviceRevision.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { isStoredAncestorVersion } from './syncNodeGraph.js';

interface HeldVersion extends DbRow {
  device_identity_key: string;
  group_id: string;
  version_id: string;
}

interface BaseProof extends DbRow {
  library_epoch: string;
  proof_revision: number;
  version_id: string;
}

export interface NodeVersionPackResult {
  baseVersionId: string | null;
  objectId: string;
  result: 'applied' | 'blocked' | 'not_applied';
  sentVersionId: string;
}

export async function stageOutboundNodeVersionHolds(port: DbPort, args: {
  createdAt: string;
  deviceId: string;
  groupId: string;
  heads: Array<{ objectId: string; versionId: string }>;
  packId: string;
  payloads?: Array<{ objectId: string; versionId: string }>;
}) {
  for (const head of args.heads) {
    const [current] = await port.query<DbRow>(
      `SELECT 1 AS ready FROM nodes node JOIN node_sync_versions version
         ON version.version_id = node.current_version_id
       JOIN sync_group_local_state local ON local.group_id = ? AND local.state = 'active'
       JOIN sync_group_devices peer ON peer.group_id = ? AND peer.device_identity_key = ?
       WHERE node.id = ? AND node.current_version_id = ? AND peer.state = 'active'
         AND local.local_device_identity_key <> peer.device_identity_key
         AND (version.body_text IS NOT NULL
           OR json_type(version.snapshot_json, '$.content') = 'text'
           OR json_type(version.snapshot_json, '$.content') IS NULL)`,
      [args.groupId, args.groupId, args.deviceId, head.objectId, head.versionId]
    );
    if (!current) throw new Error('node_version_pack_head_unavailable');
    await port.run(
      `INSERT INTO node_version_outbound_holds
       (pack_id, group_id, device_identity_key, object_id, version_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(pack_id, object_id) DO NOTHING`,
      [args.packId, args.groupId, args.deviceId, head.objectId, head.versionId, args.createdAt]
    );
    const [stored] = await port.query<HeldVersion>(
      `SELECT group_id, device_identity_key, version_id FROM node_version_outbound_holds
       WHERE pack_id = ? AND object_id = ?`, [args.packId, head.objectId]
    );
    if (stored?.group_id !== args.groupId || stored.device_identity_key !== args.deviceId ||
        stored.version_id !== head.versionId) throw new Error('node_version_pack_identity_mismatch');
  }
  for (const payload of args.payloads ?? []) {
    const [full] = await port.query<DbRow>(
      `SELECT 1 AS available FROM node_sync_versions WHERE object_id = ? AND version_id = ?
        AND (body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text'
          OR json_type(snapshot_json, '$.content') IS NULL)`,
      [payload.objectId, payload.versionId]
    );
    if (!full || !args.heads.some((head) => head.objectId === payload.objectId)) {
      throw new Error('node_version_pack_payload_unavailable');
    }
    await port.run(
      `INSERT OR IGNORE INTO node_version_outbound_payload_holds (pack_id, object_id, version_id)
       VALUES (?, ?, ?)`, [args.packId, payload.objectId, payload.versionId]
    );
  }
}

export async function confirmOutboundNodeVersionPack(port: DbPort, args: {
  confirmedAt: string;
  deviceId: string;
  groupId: string;
  libraryEpoch: string;
  packId: string;
  proofRevision: number;
  results: NodeVersionPackResult[];
}) {
  if (!args.libraryEpoch || !Number.isSafeInteger(args.proofRevision) || args.proofRevision < 0) {
    throw new Error('node_version_proof_invalid');
  }
  const accepted = await port.transaction(async (tx) => {
    const consumed = await isConsumedNodeVersionConfirmation(tx, args);
    if (!await acceptDeviceRevision(tx, args)) return false;
    for (const result of args.results) await confirmOne(tx, args, result, consumed);
    await saveNodeVersionConfirmationState(tx, args);
    await tx.run(`DELETE FROM node_version_pack_receipts WHERE pack_id = ? AND NOT EXISTS
      (SELECT 1 FROM node_version_outbound_holds hold WHERE hold.pack_id = node_version_pack_receipts.pack_id
        AND hold.object_id = node_version_pack_receipts.object_id)`, [args.packId]);
    for (const result of args.results) await collectNodeVersionPayloads(tx, result.objectId, Number.MAX_SAFE_INTEGER);
    return true;
  });
  if (!accepted) throw new Error('node_version_proof_device_revision_invalid');
}

async function confirmOne(
  port: DbPort,
  args: Parameters<typeof confirmOutboundNodeVersionPack>[1],
  result: NodeVersionPackResult,
  consumed: boolean
) {
  const [received] = await port.query<DbRow>(
    `SELECT group_id, device_identity_key, sent_version_id, result,
      base_version_id, library_epoch, proof_revision
     FROM node_version_pack_receipts WHERE pack_id = ? AND object_id = ?`,
    [args.packId, result.objectId]
  );
  if (received) {
    if (received.group_id !== args.groupId || received.device_identity_key !== args.deviceId ||
        received.sent_version_id !== result.sentVersionId || received.result !== result.result ||
        received.base_version_id !== result.baseVersionId || received.library_epoch !== args.libraryEpoch ||
        received.proof_revision !== args.proofRevision) throw new Error('node_version_pack_receipt_mismatch');
    return;
  }
  const [held] = await port.query<HeldVersion>(
    `SELECT group_id, device_identity_key, version_id FROM node_version_outbound_holds
     WHERE pack_id = ? AND object_id = ?`, [args.packId, result.objectId]
  );
  if (!held && consumed) return;
  if (held?.group_id !== args.groupId || held.device_identity_key !== args.deviceId ||
      held.version_id !== result.sentVersionId) throw new Error('node_version_pack_hold_missing');
  if (result.result === 'applied') {
    if (!result.baseVersionId) throw new Error('node_version_proof_base_missing');
    if (!await isStoredAncestorVersion(port, result.baseVersionId, result.sentVersionId)) {
      throw new Error('node_version_proof_base_not_ancestor');
    }
    await promoteBaseProof(port, args, result.objectId, result.baseVersionId);
  }
  if (result.result !== 'applied') await port.run(
    `INSERT INTO node_version_pack_receipts
     (pack_id, object_id, group_id, device_identity_key, sent_version_id, result,
      base_version_id, library_epoch, proof_revision, confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [args.packId, result.objectId, args.groupId, args.deviceId, result.sentVersionId,
      result.result, result.baseVersionId, args.libraryEpoch, args.proofRevision, args.confirmedAt]
  );
  if (result.result === 'applied') {
    await port.run(
      'DELETE FROM node_version_outbound_holds WHERE pack_id = ? AND object_id = ?',
      [args.packId, result.objectId]
    );
    await port.run(
      'DELETE FROM node_version_outbound_payload_holds WHERE pack_id = ? AND object_id = ?',
      [args.packId, result.objectId]
    );
  }
}

async function promoteBaseProof(
  port: DbPort,
  args: Parameters<typeof confirmOutboundNodeVersionPack>[1],
  objectId: string,
  versionId: string
) {
  const [existing] = await port.query<BaseProof>(
    `SELECT library_epoch, proof_revision, version_id FROM node_version_device_bases
     WHERE group_id = ? AND device_identity_key = ? AND object_id = ?`,
    [args.groupId, args.deviceId, objectId]
  );
  if (existing?.library_epoch !== undefined && existing.library_epoch !== args.libraryEpoch) {
    throw new Error('node_version_proof_epoch_changed');
  }
  if (existing && existing.proof_revision > args.proofRevision) {
    return;
  }
  if (existing && existing.proof_revision === args.proofRevision && existing.version_id !== versionId) {
    throw new Error('node_version_proof_revision_conflict');
  }
  const confirmedVersionId = existing && existing.version_id !== versionId &&
    await isStoredAncestorVersion(port, versionId, existing.version_id)
    ? existing.version_id : versionId;
  const [body] = await port.query<DbRow>(
    `SELECT 1 AS available FROM node_sync_versions WHERE object_id = ? AND version_id = ?
       AND (body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text'
         OR json_type(snapshot_json, '$.content') IS NULL)`,
    [objectId, confirmedVersionId]
  );
  if (!body) throw new Error('node_version_proof_base_unavailable');
  await port.run(
    `INSERT INTO node_version_device_bases
     (group_id, device_identity_key, object_id, version_id, library_epoch,
      proof_revision, pack_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(group_id, device_identity_key, object_id) DO UPDATE SET
       version_id = excluded.version_id, library_epoch = excluded.library_epoch,
       proof_revision = excluded.proof_revision, pack_id = excluded.pack_id,
       updated_at = excluded.updated_at`,
    [args.groupId, args.deviceId, objectId, confirmedVersionId, args.libraryEpoch,
      args.proofRevision, args.packId, args.confirmedAt]
  );
}
