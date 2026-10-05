import type { DbParams } from './dbPort.js';
import type { planNodeVersionChain } from './nodeVersionChainPlan.js';

export const CHAIN_VERSIONS_SQL = 'SELECT * FROM node_sync_versions WHERE object_id = ?';
export const CHAIN_HEAD_SQL = `SELECT COALESCE(node.current_version_id, tomb.version_id) AS current_version_id,
  COALESCE(node.sync_dirty, 0) AS sync_dirty FROM (SELECT ? AS id) requested
  LEFT JOIN nodes node ON node.id = requested.id
  LEFT JOIN node_sync_tombstones tomb ON tomb.node_id = requested.id`;
export const CHAIN_EDGES_SQL = `SELECT edge.* FROM node_sync_version_parents edge
  JOIN node_sync_versions version ON version.version_id = edge.version_id
  WHERE version.object_id = ? ORDER BY edge.version_id, edge.ordinal`;

const CHAIN_READ_TABLES = new Set([
  'node_version_device_bases', 'sync_group_local_state', 'sync_group_devices',
  'sync_delivery_receipts', 'node_sync_versions', 'node_sync_version_parents',
  'node_version_member_positions', 'node_version_local_origins', 'node_version_outbound_holds',
  'node_version_outbound_payload_holds', 'node_version_local_holds',
  'sync_change_log', 'node_sync_conflicts', 'node_text_alternatives',
  'nodes', 'node_sync_tombstones', 'sync_object_state'
]);

/** Bind the fixed retention read queries to an attached immutable source view. */
export function qualifyNodeVersionReadSql(sql: string, schema = 'main') {
  if (!/^[a-z][a-z0-9_]*$/u.test(schema)) throw new Error('node_version_schema_invalid');
  if (schema === 'main') return sql;
  return sql.replace(/\b(FROM|JOIN)\s+([a-z_]+)\b/gu, (match, keyword: string, table: string) =>
    CHAIN_READ_TABLES.has(table) ? `${keyword} ${schema}.${table}` : match);
}

const MEMBER_POSITIONS_SQL = `SELECT position.adopted_version_id, 0 FROM node_version_member_positions position
  JOIN sync_group_local_state local ON local.group_id = position.group_id AND local.state = 'active'
  WHERE position.object_id = ? AND position.device_identity_key <> local.local_device_identity_key
    AND position.resolved_revision IS NULL
UNION SELECT pending.value, 0 FROM node_version_member_positions position
  JOIN sync_group_local_state local ON local.group_id = position.group_id AND local.state = 'active'
  JOIN json_each(position.pending_version_ids_json) pending
  WHERE position.object_id = ? AND position.device_identity_key <> local.local_device_identity_key
    AND position.resolved_revision IS NULL`;

const OUTBOUND_REFERENCES_SQL = `SELECT hold.version_id, 1 FROM node_version_outbound_holds hold
  JOIN sync_group_local_state local ON local.group_id = hold.group_id AND local.state = 'active'
  JOIN sync_group_devices peer ON peer.group_id = hold.group_id
    AND peer.device_identity_key = hold.device_identity_key AND peer.state = 'active'
  WHERE hold.object_id = ? AND peer.device_identity_key <> local.local_device_identity_key
UNION SELECT payload.version_id, 1 FROM node_version_outbound_payload_holds payload
  JOIN node_version_outbound_holds hold ON hold.pack_id = payload.pack_id AND hold.object_id = payload.object_id
  JOIN sync_group_local_state local ON local.group_id = hold.group_id AND local.state = 'active'
  JOIN sync_group_devices peer ON peer.group_id = hold.group_id
    AND peer.device_identity_key = hold.device_identity_key AND peer.state = 'active'
  WHERE payload.object_id = ? AND peer.device_identity_key <> local.local_device_identity_key`;

const LOCAL_REFERENCES_SQL = `SELECT version.version_id, 0 FROM node_sync_versions version
      WHERE version.object_id = ? AND NOT EXISTS (
        SELECT 1 FROM node_sync_version_parents edge WHERE edge.parent_version_id = version.version_id)
        AND NOT EXISTS (SELECT 1 FROM node_sync_versions child
          WHERE child.parent_version_id = version.version_id)
    UNION SELECT version_id, 0 FROM node_version_local_holds WHERE object_id = ?
    UNION SELECT base_version_id, 0 FROM sync_change_log
      WHERE object_type = 'node' AND object_id = ? AND applied_at IS NULL
    UNION SELECT result_version_id, 0 FROM sync_change_log
      WHERE object_type = 'node' AND object_id = ? AND applied_at IS NULL
    UNION SELECT conflict_version_id, 0 FROM node_sync_conflicts WHERE object_id = ?
    UNION SELECT parent_version_id, 0 FROM node_sync_conflicts WHERE object_id = ?
    UNION SELECT source_version_id, 0 FROM node_text_alternatives WHERE node_id = ? AND status = 'available'
    UNION SELECT anchor_source_version_id, 0 FROM nodes WHERE anchor_source_version_id IN
      (SELECT version_id FROM node_sync_versions WHERE object_id = ?)
    UNION SELECT current_version_id, 0 FROM sync_object_state
      WHERE object_type = 'node' AND object_id = ? AND current_version_id IS NOT NULL`;

export function chainReferencesQuery(nodeId: string, retireLegacyHistory = false,
  schema = 'main') {
  return {
    sql: qualifyNodeVersionReadSql(`SELECT base.version_id, 0 AS frozen FROM node_version_device_bases base
      JOIN sync_group_local_state local ON local.group_id = base.group_id AND local.state = 'active'
      JOIN sync_group_devices device ON device.group_id = base.group_id
        AND device.device_identity_key = base.device_identity_key
      WHERE base.object_id = ? AND base.device_identity_key <> local.local_device_identity_key
        AND NOT EXISTS (SELECT 1 FROM node_version_member_positions position
          WHERE position.group_id = base.group_id AND position.device_identity_key = base.device_identity_key
            AND position.object_id = base.object_id AND position.library_epoch = base.library_epoch
            AND position.proof_revision >= base.proof_revision)
    UNION SELECT receipt.payload_identity, 0 FROM sync_delivery_receipts receipt
      JOIN sync_group_local_state local ON local.state = 'active'
      JOIN sync_group_devices peer ON peer.group_id = local.group_id
        AND peer.device_identity_key = receipt.peer_id AND peer.state = 'active'
      JOIN node_sync_versions version ON version.version_id = receipt.payload_identity
      WHERE receipt.stream_name = 'node_version' AND receipt.status = 'confirmed' AND receipt.object_id = ?
        AND NOT EXISTS (WITH RECURSIVE proven(version_id) AS (
          SELECT base.version_id FROM node_version_device_bases base
            WHERE base.group_id = local.group_id AND base.device_identity_key = peer.device_identity_key
              AND base.object_id = receipt.object_id
          UNION SELECT edge.parent_version_id FROM node_sync_version_parents edge
            JOIN proven ON proven.version_id = edge.version_id
          UNION SELECT version.parent_version_id FROM node_sync_versions version
            JOIN proven ON proven.version_id = version.version_id WHERE version.parent_version_id IS NOT NULL
        ) SELECT 1 FROM proven WHERE proven.version_id = receipt.payload_identity)
    UNION SELECT version.version_id, 0 FROM node_sync_versions version
      WHERE version.object_id = ? AND ${retireLegacyHistory ? '0' : '1'} AND (version.body_text IS NOT NULL
        OR json_type(version.snapshot_json, '$.content') = 'text' OR json_type(version.snapshot_json, '$.content') IS NULL)
      AND EXISTS (SELECT 1 FROM sync_group_devices peer JOIN sync_group_local_state local
        ON local.group_id = peer.group_id AND local.state = 'active'
        WHERE peer.state = 'active' AND peer.device_identity_key <> local.local_device_identity_key
          AND NOT EXISTS (SELECT 1 FROM node_version_device_bases base
            WHERE base.group_id = peer.group_id AND base.device_identity_key = peer.device_identity_key
              AND base.object_id = version.object_id)
          AND NOT EXISTS (SELECT 1 FROM sync_delivery_receipts receipt WHERE receipt.peer_id = peer.device_identity_key
            AND receipt.object_id = version.object_id AND receipt.stream_name = 'node_version' AND receipt.status = 'confirmed'))
    UNION ${MEMBER_POSITIONS_SQL}
    UNION ${OUTBOUND_REFERENCES_SQL}
    UNION ${LOCAL_REFERENCES_SQL}`, schema),
    params: Array<string>(16).fill(nodeId)
  };
}

export function chainMutationStatements(plan: ReturnType<typeof planNodeVersionChain>) {
  const statements: Array<{ sql: string; params: DbParams }> = [];
  if (plan.skipped || !plan.removed?.length) return statements;
  for (const id of plan.removed) statements.push({
    sql: `UPDATE node_sync_versions SET body_text = NULL,
      snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id = ?`,
    params: [id]
  });
  return statements;
}
