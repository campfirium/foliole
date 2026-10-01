import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';

import { upsertTextBodyBlob } from './contentBodyBlobs.js';
import type { DatabaseDriver } from './driver.js';
import { projectNodeInlineContent } from './nodeInlineProjection.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from './searchIndexInvalidations.js';

export function writeNodeBody(input: {
  content: string;
  driver: DatabaseDriver;
  nodeId: string;
  title: string;
  updatedAt: string;
}) {
  const bodyBlobHash = upsertTextBodyBlob(input.driver, input.content, input.updatedAt);
  input.driver.execute(
    `UPDATE nodes
     SET sync_dirty = CASE WHEN body_blob_hash IS NOT ? THEN 1 ELSE sync_dirty END,
         content = ?, body_blob_hash = ?, opening_text = ?, updated_at = ?
     WHERE id = ?`,
    [
      bodyBlobHash,
      projectNodeInlineContent(input.content),
      bodyBlobHash,
      resolveNodeOpeningText(input.content, input.title),
      input.updatedAt,
      input.nodeId
    ]
  );
  enqueueWorkspaceSearchInvalidationForNodeIds(input.driver, [input.nodeId]);
  return bodyBlobHash;
}
