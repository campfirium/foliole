import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';

import { openDatabaseConnection } from './connection.js';

export function parseAnchorLink(value: string) {
  return JSON.parse(value) as {
    id: string;
    kind: string;
    locator?: { from: number; originalText: string; to: number };
  };
}

export function readPersistedImportState(sourceFingerprint: string, nodeId: string | null) {
  const connection = openDatabaseConnection();
  const sourceRow = connection.sqlite
    .prepare(
      `SELECT provider, source_kind, source_name, source_locator, latest_node_id
       FROM import_sources
       WHERE source_fingerprint = ?`
    )
    .get(sourceFingerprint);
  const runRows = connection.sqlite
    .prepare(
      `SELECT duplicate_semantic, result_status, node_id, degraded_reason
       FROM import_runs
       WHERE source_fingerprint = ?
       ORDER BY imported_at ASC`
    )
    .all(sourceFingerprint);
  const nodeRow = nodeId
    ? connection.sqlite.prepare(`SELECT n.parent_id, n.title, n.hide_title_heading,
      ${buildNodeBodyContentSql()} AS content, n.opening_text FROM nodes n
      LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.id = ?`).get(nodeId)
    : undefined;
  const childRows = nodeId
    ? connection.sqlite
        .prepare(`SELECT n.parent_id, n.title, ${buildNodeBodyContentSql()} AS content, n.anchor_link FROM nodes n
          LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.parent_id = ? ORDER BY n.created_at ASC`)
        .all(nodeId) as Array<{ anchor_link: string; content: string; parent_id: string; title: string }>
    : [];

  return { childRows, nodeRow, runRows, sourceRow };
}

export function readInboxChildTitlesByOrder() {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT n.title
       FROM nodes n
       WHERE n.parent_id = 'special-inbox'
       ORDER BY n.created_at DESC, n.title ASC`
    )
    .all() as Array<{ title: string }>;
}
