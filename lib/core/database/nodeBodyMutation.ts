import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';

import { upsertTextBodyBlob } from './contentBodyBlobs.js';
import type { DatabaseDriver } from './driver.js';
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
     SET content = ?, body_blob_hash = ?, opening_text = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.content,
      bodyBlobHash,
      resolveNodeOpeningText(input.content, input.title),
      input.updatedAt,
      input.nodeId
    ]
  );
  enqueueWorkspaceSearchInvalidationForNodeIds(input.driver, [input.nodeId]);
  return bodyBlobHash;
}
