import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { openDatabaseConnection } from '../database/connection.js';

import type { NodeSourceUpdatePreview } from './nodeSourceUpdatePreview.js';
import { normalizeNodeSourcePreviewContent } from './nodeSourceUpdatePreviewContent.js';
import { loadReadwiseApiSourceUpdate } from './readwiseApiSourceUpdate.js';

interface SourceNodeRow extends NodeBodyRow {
  content: string;
  id: string;
}

export function loadReadwiseApiUpdatePreview(nodeId: string): NodeSourceUpdatePreview | null {
  const remoteUpdate = loadReadwiseApiSourceUpdate(nodeId);
  const sourceNode = remoteUpdate ? readSourceNode(nodeId) : null;
  if (!remoteUpdate || !sourceNode || remoteUpdate.content === sourceNode.content) {
    return null;
  }
  const highlightCount = countCurrentHighlights(nodeId);
  return {
    checked_at: remoteUpdate.sourceUpdatedAt ?? new Date().toISOString(),
    current_highlight_count: highlightCount,
    current_content: normalizeNodeSourcePreviewContent(sourceNode.content),
    kind: 'source_update',
    source_node_id: nodeId,
    updated_highlight_count: highlightCount,
    updated_content: normalizeNodeSourcePreviewContent(remoteUpdate.content)
  };
}

function readSourceNode(nodeId: string) {
  const row = openDatabaseConnection().driver.queryOne<SourceNodeRow>(
    `SELECT n.id, n.content, n.body_blob_hash, cbd.data AS body_blob_data
     FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ?`,
    [nodeId]
  );
  return row ? { ...row, content: requireResolvedNodeBody(row, row.id).content } : null;
}

function countCurrentHighlights(nodeId: string) {
  return openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM nodes
     WHERE parent_id = ? AND anchor_link IS NOT NULL AND deleted_at IS NULL`,
    [nodeId]
  )?.count ?? 0;
}
