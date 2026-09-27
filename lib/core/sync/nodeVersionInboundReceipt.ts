import type { DbPort, DbRow } from './dbPort.js';
import type { NodeVersionPackResult } from './nodeVersionDeliveryProof.js';
import { loadMergeBase, storedSyncNodeVersionBody } from './syncNodeGraph.js';

interface IncomingHead extends DbRow {
  object_id: string;
  sent_version_id: string;
  previous_version_id: string | null;
  tombstoned: number;
}

export interface PreparedNodeVersionReceipt {
  heads: IncomingHead[];
  packId: string;
}

export interface OutboundNodeVersionReceipt {
  deviceId: string;
  groupId: string;
  libraryEpoch: string;
  packId: string;
  proofRevision: number;
  results: NodeVersionPackResult[];
  sourceDeviceId: string;
}

export async function loadPendingNodeVersionReceipts(port: DbPort, sourceDeviceId: string) {
  const rows = await port.query<DbRow>(
    `SELECT pack_id, group_id, source_device_identity_key, target_device_identity_key,
       library_epoch, proof_revision, results_json
     FROM node_version_inbound_receipts
     WHERE source_device_identity_key = ? AND delivered_at IS NULL
     ORDER BY proof_revision LIMIT 32`, [sourceDeviceId]
  );
  return rows.map((row) => ({
    deviceId: String(row.target_device_identity_key), groupId: String(row.group_id),
    libraryEpoch: String(row.library_epoch), packId: String(row.pack_id),
    proofRevision: Number(row.proof_revision),
    results: JSON.parse(String(row.results_json)) as NodeVersionPackResult[],
    sourceDeviceId: String(row.source_device_identity_key)
  } satisfies OutboundNodeVersionReceipt));
}

export async function markNodeVersionReceiptDelivered(port: DbPort, packId: string) {
  await port.run(
    `UPDATE node_version_inbound_receipts SET delivered_at = ?
     WHERE pack_id = ? AND delivered_at IS NULL`, [new Date().toISOString(), packId]
  );
}

export async function prepareInboundNodeVersionReceipt(port: DbPort, alias: string) {
  const [manifest] = await port.query<{ value: string }>(
    `SELECT value FROM ${alias}.pack_manifest WHERE key = 'manifest_json'`
  );
  const packId = manifest && (JSON.parse(manifest.value) as { pack_id?: unknown }).pack_id;
  if (typeof packId !== 'string' || !packId) throw new Error('node_version_pack_id_missing');
  const heads = await port.query<IncomingHead>(
    `SELECT incoming.id AS object_id, incoming.current_version_id AS sent_version_id,
       local.current_version_id AS previous_version_id,
       CASE WHEN tomb.node_id IS NULL THEN 0 ELSE 1 END AS tombstoned
     FROM ${alias}.nodes incoming
     LEFT JOIN main.nodes local ON local.id = incoming.id
     LEFT JOIN main.node_sync_tombstones tomb ON tomb.node_id = incoming.id
     WHERE incoming.current_version_id IS NOT NULL
       AND incoming.id NOT IN ('special-inbox', 'special-virtual-root')`
  );
  return { heads, packId } satisfies PreparedNodeVersionReceipt;
}

export async function recordInboundNodeVersionReceipt(
  port: DbPort,
  prepared: PreparedNodeVersionReceipt,
  sourceDeviceId: string
) {
  const [local] = await port.query<{ group_id: string; local_device_identity_key: string }>(
    `SELECT group_id, local_device_identity_key FROM sync_group_local_state
     WHERE singleton_id = 1 AND state = 'active'`
  );
  if (!local) throw new Error('node_version_receipt_group_unavailable');
  const [source] = await port.query<DbRow>(
    `SELECT 1 AS active FROM sync_group_devices WHERE group_id = ?
       AND device_identity_key = ? AND state = 'active'`, [local.group_id, sourceDeviceId]
  );
  if (!source) throw new Error('node_version_receipt_source_unavailable');
  const [existing] = await port.query<{
    group_id: string; results_json: string;
    source_device_identity_key: string; target_device_identity_key: string;
  }>(
    `SELECT group_id, source_device_identity_key, target_device_identity_key, results_json
     FROM node_version_inbound_receipts WHERE pack_id = ?`, [prepared.packId]
  );
  if (existing) {
    if (existing.group_id !== local.group_id || existing.source_device_identity_key !== sourceDeviceId ||
        existing.target_device_identity_key !== local.local_device_identity_key) {
      throw new Error('node_version_receipt_identity_mismatch');
    }
    return JSON.parse(existing.results_json) as NodeVersionPackResult[];
  }
  const results: NodeVersionPackResult[] = [];
  for (const head of prepared.heads) results.push(await resolveHead(port, head));
  const { epoch, revision } = await advanceLocalSourceRevision(port, sourceDeviceId);
  await port.run(
    `INSERT INTO node_version_inbound_receipts
     (pack_id, group_id, source_device_identity_key, target_device_identity_key,
      library_epoch, proof_revision, results_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [prepared.packId, local.group_id, sourceDeviceId, local.local_device_identity_key,
      epoch, revision, JSON.stringify(results), new Date().toISOString()]
  );
  return results;
}

async function advanceLocalSourceRevision(port: DbPort, sourceDeviceId: string) {
  const [proof] = await port.query<{ library_epoch: string; proof_revision: number }>(
    'SELECT library_epoch, proof_revision FROM node_version_local_proof_state WHERE singleton_id = 1'
  );
  if (!proof) throw new Error('node_version_local_proof_missing');
  const epoch = proof.library_epoch;
  const [sourceRevision] = await port.query<{ proof_revision: number }>(
    `SELECT proof_revision FROM node_version_local_source_revisions
     WHERE source_device_identity_key = ?`, [sourceDeviceId]
  );
  const revision = (sourceRevision?.proof_revision ?? 0) + 1;
  if (!Number.isSafeInteger(revision)) throw new Error('node_version_proof_revision_exhausted');
  await port.run(
    `INSERT INTO node_version_local_proof_state (singleton_id, library_epoch, proof_revision)
     VALUES (1, ?, ?) ON CONFLICT(singleton_id) DO UPDATE SET proof_revision = excluded.proof_revision`,
    [epoch, proof.proof_revision + 1]
  );
  await port.run(
    `INSERT INTO node_version_local_source_revisions (source_device_identity_key, proof_revision)
     VALUES (?, ?) ON CONFLICT(source_device_identity_key) DO UPDATE SET
       proof_revision = excluded.proof_revision`,
    [sourceDeviceId, revision]
  );
  return { epoch, revision };
}

async function resolveHead(port: DbPort, head: IncomingHead): Promise<NodeVersionPackResult> {
  const common = { objectId: head.object_id, sentVersionId: head.sent_version_id };
  const [tombstone] = await port.query<DbRow>(
    'SELECT 1 AS blocked FROM node_sync_tombstones WHERE node_id = ?', [head.object_id]
  );
  if (head.tombstoned || tombstone) return { ...common, baseVersionId: null, result: 'blocked' };
  const baseId = head.previous_version_id
    ? (await loadMergeBase(port, head.previous_version_id, head.sent_version_id))?.version_id
    : head.sent_version_id;
  if (!baseId) return { ...common, baseVersionId: null, result: 'not_applied' };
  const [local] = await port.query<DbRow>(
    `SELECT * FROM node_sync_versions WHERE version_id = ? AND object_id = ?`,
    [baseId, head.object_id]
  );
  if (!local || storedSyncNodeVersionBody(local as Parameters<typeof storedSyncNodeVersionBody>[0]) === null) {
    return { ...common, baseVersionId: null, result: 'not_applied' };
  }
  return { ...common, baseVersionId: baseId, result: 'applied' };
}
