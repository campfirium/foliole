import { NODE_CHILD_PAYLOAD_SOURCES, NODE_CHILD_STATE_TYPES_SQL, nodeChildOwnerSql } from '../database/nodeChildStateSql.js';
import { ROOT_CHILD_ORDER_ID } from '../database/parentChildOrder.js';

const absent = (table: string, key: string) => `NOT EXISTS (SELECT 1 FROM ${table} payload WHERE payload.${key} = state.object_id)`;

/** A child mark may go once its node is gone and nothing on this device still holds the child itself. */
function orphanChildSql() {
  const owner = nodeChildOwnerSql('state');
  const payloads = NODE_CHILD_PAYLOAD_SOURCES.filter(([type]) => type !== 'import_source')
    .map(([type, table, key]) => `WHEN '${type}' THEN ${absent(table, key)}`).join(' ');
  return `(state.object_type IN (${NODE_CHILD_STATE_TYPES_SQL})
    AND NOT (state.object_type = 'parent_child_order' AND state.object_id = '${ROOT_CHILD_ORDER_ID}')
    AND NOT EXISTS (SELECT 1 FROM framed_sync_inventory node WHERE node.object_type = 'node' AND node.object_id = ${owner})
    AND NOT EXISTS (SELECT 1 FROM nodes WHERE id = ${owner})
    AND CASE state.object_type ${payloads} ELSE 0 END)`;
}

/**
 * Deletion marks every member applied before the group line whose object no longer exists on this device.
 * Settings, view state and foreground sources are kept: their marks do not map to one business row.
 */
export function reclaimableStateTombstonesSql(hasWatchedFolders: boolean) {
  const kinds = [
    `(state.object_type = 'external_document' AND ${absent('external_documents', 'document_id')})`,
    `(state.object_type = 'external_folder' AND ${absent('external_search_folders', 'id')}
      AND NOT EXISTS (SELECT 1 FROM external_documents document WHERE document.folder_id = state.object_id))`,
    `(state.object_type = 'import_source' AND ${absent('import_sources', 'source_fingerprint')})`,
    ...(hasWatchedFolders ? [`(state.object_type = 'watched_folder' AND ${absent('watched_folder_bindings', 'binding_id')})`] : []),
    orphanChildSql(),
    `(state.object_type = 'node' AND NOT EXISTS (SELECT 1 FROM nodes WHERE id = state.object_id)
      AND NOT EXISTS (SELECT 1 FROM node_sync_tombstones WHERE node_id = state.object_id)
      AND NOT EXISTS (SELECT 1 FROM node_sync_versions WHERE object_id = state.object_id))`
  ];
  return `SELECT state.object_type, state.object_id FROM sync_object_state state
    WHERE state.deleted_at IS NOT NULL AND state.deleted_at < ? AND (${kinds.join(' OR ')})
    ORDER BY state.object_type, state.object_id LIMIT ?`;
}

export const WATCHED_FOLDER_TABLE_SQL = "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'watched_folder_bindings'";

export const RECLAIM_STATE_TOMBSTONE_STATEMENTS = [
  'DELETE FROM sync_node_child_owners WHERE object_type = ? AND object_id = ?',
  'DELETE FROM sync_object_state WHERE object_type = ? AND object_id = ?'
] as const;
