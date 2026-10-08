import { openDatabaseConnection } from '../database/connection.js';

import { readSourceNode } from './nodeSourcePreviewBody.js';
import type { NodeSourceUpdatePreview } from './nodeSourceUpdatePreview.js';
import { normalizeNodeSourcePreviewContent } from './nodeSourceUpdatePreviewContent.js';
import { loadReadwiseApiSourceUpdate } from './readwiseApiSourceUpdate.js';

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

function countCurrentHighlights(nodeId: string) {
  return openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM nodes
     WHERE parent_id = ? AND anchor_link IS NOT NULL AND deleted_at IS NULL`,
    [nodeId]
  )?.count ?? 0;
}
