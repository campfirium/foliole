import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { openDatabaseConnection } from '../database/connection.js';

export interface ReadwiseTopicMergeSourceNode extends DatabaseRow, NodeBodyRow {
  id: string;
  kind: string;
  source_kind: string | null;
  source_locator: string | null;
  source_name: string | null;
  title: string;
}

export function readReadwiseTopicMergeSourceNode(nodeId: string) {
  const row = openDatabaseConnection().driver.queryOne<ReadwiseTopicMergeSourceNode>(
    `SELECT nodes.id, nodes.content, nodes.body_blob_hash, cbd.data AS body_blob_data,
            nodes.title, nodes.kind, import_sources.source_kind,
            import_sources.source_locator, import_sources.source_name
     FROM nodes
     LEFT JOIN content_blob_data cbd ON cbd.hash = nodes.body_blob_hash
     LEFT JOIN import_sources ON import_sources.latest_node_id = nodes.id
     WHERE nodes.id = ?`,
    [nodeId]
  );
  return row ? { ...row, content: requireResolvedNodeBody(row, row.id).content } : null;
}

export function readReadwiseTopicHighlightContents(nodeId: string) {
  return openDatabaseConnection().driver
    .queryAll<{ content: string }>(
      `SELECT content
       FROM nodes
       WHERE parent_id = ?
         AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [nodeId]
    )
    .map((row) => row.content);
}
