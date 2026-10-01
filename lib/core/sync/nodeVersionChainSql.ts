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

export function chainReferencesQuery(nodeId: string, retireLegacyHistory = false) {
  return {
    sql: `SELECT base.version_id, 0 AS frozen FROM node_version_device_bases base
      JOIN sync_group_local_state local ON local.group_id = base.group_id AND local.state = 'active'
      JOIN sync_group_devices device ON device.group_id = base.group_id
        AND device.device_identity_key = base.device_identity_key AND device.state = 'active'
      WHERE base.object_id = ? AND base.device_identity_key <> local.local_device_identity_key
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
        AND NOT EXISTS (SELECT 1 FROM sync_delivery_receipts newer JOIN node_sync_versions next
          ON next.version_id = newer.payload_identity
          WHERE newer.peer_id = receipt.peer_id AND newer.object_id = receipt.object_id
            AND newer.stream_name = 'node_version' AND newer.status = 'confirmed'
            AND (next.created_at > version.created_at OR
              (next.created_at = version.created_at AND next.version_id > version.version_id)))
    UNION SELECT version.version_id, 0 FROM node_sync_versions version
      WHERE version.object_id = ? AND ${retireLegacyHistory ? '0' : '1'} AND (version.body_text IS NOT NULL
        OR json_type(version.snapshot_json, '$.content') = 'text' OR json_type(version.snapshot_json, '$.content') IS NULL)
        AND NOT EXISTS (SELECT 1 FROM node_version_local_origins origin
        WHERE origin.version_id = version.version_id)
      AND EXISTS (SELECT 1 FROM sync_group_devices peer JOIN sync_group_local_state local
        ON local.group_id = peer.group_id AND local.state = 'active'
        WHERE peer.state = 'active' AND peer.device_identity_key <> local.local_device_identity_key
          AND NOT EXISTS (SELECT 1 FROM node_version_device_bases base
            WHERE base.group_id = peer.group_id AND base.device_identity_key = peer.device_identity_key
              AND base.object_id = version.object_id)
          AND NOT EXISTS (SELECT 1 FROM sync_delivery_receipts receipt WHERE receipt.peer_id = peer.device_identity_key
            AND receipt.object_id = version.object_id AND receipt.stream_name = 'node_version' AND receipt.status = 'confirmed'))
    UNION ${OUTBOUND_REFERENCES_SQL}
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
    UNION SELECT current_version_id, 0 FROM sync_object_state WHERE object_type = 'node' AND object_id = ?`,
    params: Array<string>(13).fill(nodeId)
  };
}

export function chainMutationStatements(plan: ReturnType<typeof planNodeVersionChain>) {
  const statements: Array<{ sql: string; params: DbParams }> = [];
  if (plan.skipped || !plan.removed?.length) return statements;
  for (const relation of plan.relations!) {
    statements.push({ sql: 'DELETE FROM node_sync_version_parents WHERE version_id = ?', params: [relation.id] });
    statements.push({ sql: 'UPDATE node_sync_versions SET parent_version_id = ? WHERE version_id = ?',
      params: [relation.parents[0] ?? null, relation.id] });
    statements.push({ sql: 'UPDATE node_sync_tombstones SET parent_version_id = ? WHERE version_id = ?',
      params: [relation.parents[0] ?? null, relation.id] });
    for (const [ordinal, parent] of relation.parents.entries()) statements.push({
      sql: 'INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal) VALUES (?, ?, ?)',
      params: [relation.id, parent, ordinal]
    });
  }
  for (const id of plan.removed!) {
    statements.push({ sql: 'DELETE FROM node_sync_version_parents WHERE version_id = ?', params: [id] });
    statements.push({ sql: 'DELETE FROM node_version_local_origins WHERE version_id = ?', params: [id] });
    statements.push({ sql: "DELETE FROM sync_delivery_receipts WHERE stream_name = 'node_version' AND payload_identity = ?", params: [id] });
    statements.push({ sql: 'DELETE FROM node_sync_versions WHERE version_id = ?', params: [id] });
  }
  return statements;
}
