import type { DbPort, DbRow } from './dbPort.js';
import { nodePositionFactId, nodePositionPayloadSchema, nodePositionWriteStatements,
  parseNodePositionPayload, versionPositionStorage, type VersionPositionDomain } from './nodeVersionMemberPositionFact.js';
import { hashText } from './syncNodeResolution.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

/** An authenticated relay carries the owner's original, comparable declaration. */
export async function applyNodeMemberPosition(port: DbPort, record: SyncPackSyncObjectRecord) {
  return applyVersionMemberPosition(port, record, 'node');
}

export async function applyVersionMemberPosition(port: DbPort, record: SyncPackSyncObjectRecord,
  domain: VersionPositionDomain) {
  const storage = versionPositionStorage(domain);
  if (record.deleted_at || !record.payload_json) throw new Error('node_position_fact_invalid');
  const { payload, pending } = parseNodePositionPayload(JSON.parse(record.payload_json));
  if (record.object_id !== nodePositionFactId(payload, domain) ||
      record.content_hash !== hashText(JSON.stringify(payload))) throw new Error('node_position_fact_hash_mismatch');
  const [member] = await port.query<{ state: string; local_device_identity_key: string }>(
    `SELECT member.state, local.local_device_identity_key FROM sync_group_devices member
      JOIN sync_group_local_state local ON local.group_id = member.group_id AND local.state = 'active'
      WHERE member.group_id = ? AND member.device_identity_key = ?`,
    [payload.group_id, payload.device_identity_key]);
  if (!member) throw new Error('node_position_member_unknown');
  const [known] = await port.query<DbRow>(`SELECT adopted_version_id, device_identity_key,
    group_id, library_epoch, object_id, pending_version_ids_json, proof_revision, updated_at
    FROM ${storage.table} WHERE fact_id = ?`, [record.object_id]);
  if (known) {
    const previous = nodePositionPayloadSchema.parse(known);
    if (previous.library_epoch !== payload.library_epoch) throw new Error('node_position_epoch_changed');
    if (previous.proof_revision > payload.proof_revision) return false;
    if (previous.proof_revision === payload.proof_revision) {
      if (JSON.stringify(previous) !== JSON.stringify(payload)) throw new Error('node_position_revision_collision');
      return false;
    }
  }
  if (member.local_device_identity_key === payload.device_identity_key) return false;
  for (const versionId of [payload.adopted_version_id, ...pending]) {
    const [version] = await port.query<{ object_id: string }>(
      `SELECT ${storage.ownerColumn} AS object_id FROM ${storage.versionTable} WHERE version_id = ?`, [versionId]);
    if (version?.object_id !== payload.object_id) throw new Error(domain === 'node'
      ? `node_position_lineage_unproven:${payload.object_id}`
      : `parent_order_position_lineage_unproven:${versionId}`);
  }
  for (const statement of nodePositionWriteStatements(payload, domain)) await port.run(statement.sql, statement.params);
  return true;
}

export async function applySyncPackNodeMemberPositions(port: DbPort, incomingAlias = 'inc') {
  if (!/^[a-z][a-z0-9_]*$/u.test(incomingAlias)) throw new Error('sync_identity_schema_invalid');
  const rows = await port.query<SyncPackSyncObjectRecord & DbRow>(`SELECT * FROM
    ${incomingAlias}.sync_objects WHERE object_type = 'node_position' ORDER BY object_id`);
  let applied = 0;
  for (const row of rows) if (await applyNodeMemberPosition(port, row)) applied++;
  return applied;
}
