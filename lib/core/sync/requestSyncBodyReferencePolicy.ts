import { z } from 'zod';

export const REQUEST_CHAIN_HEAD_SQL = `SELECT COALESCE(node.current_version_id, tomb.version_id) AS current_version_id,
  COALESCE(node.sync_dirty, 0) AS sync_dirty, COALESCE(node.kind, json_extract(version.snapshot_json, '$.kind')) AS kind
  FROM (SELECT ? AS id) requested LEFT JOIN nodes node ON node.id = requested.id
  LEFT JOIN node_sync_tombstones tomb ON tomb.node_id = requested.id
  LEFT JOIN node_sync_versions version ON version.version_id = tomb.version_id`;

export const REQUEST_LOCAL_REFERENCES_SQL = `SELECT version_id FROM node_sync_versions version
  WHERE object_id = ? AND NOT EXISTS (SELECT 1 FROM node_sync_version_parents edge WHERE edge.parent_version_id = version.version_id)
    AND NOT EXISTS (SELECT 1 FROM node_sync_versions child WHERE child.parent_version_id = version.version_id)
  UNION SELECT version_id FROM node_version_local_holds
  WHERE object_id = ? AND substr(hold_id, 1, 14) <> 'sync-exchange:'
  UNION SELECT base_version_id FROM sync_change_log WHERE object_type = 'node' AND object_id = ? AND applied_at IS NULL
  UNION SELECT result_version_id FROM sync_change_log WHERE object_type = 'node' AND object_id = ? AND applied_at IS NULL
  UNION SELECT conflict_version_id FROM node_sync_conflicts WHERE object_id = ?
  UNION SELECT parent_version_id FROM node_sync_conflicts WHERE object_id = ?
  UNION SELECT edge.parent_version_id FROM node_sync_version_parents edge
    JOIN node_sync_conflicts conflict ON conflict.conflict_version_id = edge.version_id WHERE conflict.object_id = ?
  UNION SELECT version.parent_version_id FROM node_sync_versions version
    JOIN node_sync_conflicts conflict ON conflict.conflict_version_id = version.version_id WHERE conflict.object_id = ?
  UNION SELECT source_version_id FROM node_text_alternatives WHERE node_id = ? AND status = 'available'
  UNION SELECT anchor_source_version_id FROM nodes WHERE anchor_source_version_id IN
    (SELECT version_id FROM node_sync_versions WHERE object_id = ?)`;

export const REQUEST_MEMBER_REFERENCES_SQL = `SELECT peer.device_identity_key, position.adopted_version_id,
    position.pending_version_ids_json
  FROM sync_group_local_state local
  JOIN sync_group_devices peer ON peer.group_id = local.group_id AND peer.state = 'active'
  LEFT JOIN node_version_device_revisions revision ON revision.group_id = peer.group_id
    AND revision.device_identity_key = peer.device_identity_key
  LEFT JOIN node_version_member_positions position ON position.group_id = peer.group_id
    AND position.device_identity_key = peer.device_identity_key AND position.object_id = ?
    AND position.library_epoch = CASE WHEN peer.device_identity_key = local.local_device_identity_key
      THEN (SELECT library_epoch FROM node_version_local_proof_state WHERE singleton_id = 1)
      ELSE revision.library_epoch END
  WHERE local.state = 'active'`;

export type RequestMemberPosition = {
  device_identity_key: string;
  adopted_version_id: string | null;
  pending_version_ids_json: string | null;
};
const pendingSchema = z.array(z.string().min(1));

export const REQUEST_LOCAL_DEVICE_SQL = "SELECT local_device_identity_key FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'";

export function requestSyncReferenceSet(headId: string, refs: readonly { version_id: string | null }[],
  positions: readonly RequestMemberPosition[], localDeviceId?: string) {
  const keep = new Set([headId]);
  for (const row of refs) if (row.version_id) keep.add(row.version_id);
  let unknownPeer = false;
  for (const position of positions) {
    if (!position.adopted_version_id || position.pending_version_ids_json === null) {
      if (position.device_identity_key !== localDeviceId) unknownPeer = true;
      continue;
    }
    keep.add(position.adopted_version_id);
    for (const id of pendingSchema.parse(JSON.parse(position.pending_version_ids_json))) keep.add(id);
  }
  return { keep, skipped: unknownPeer ? 'active_member_position_unknown' as const : null };
}
