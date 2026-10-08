import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';
import { normalizeNodeTitle } from '../nodes/nodeTitleBudget.js';

import type { DatabaseDriver } from './driver.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from './searchIndexInvalidations.js';
import { collectTextBodyBlobCandidates } from './textBodyBlobCollection.js';
import { hashTextBody } from './textBodyHash.js';

export function writeNodeBody(input: {
  content: string;
  driver: DatabaseDriver;
  nodeId: string;
  title: string;
  updatedAt: string;
}) {
  return input.driver.transaction(() => {
    const previous = input.driver.queryOne<{ body_blob_hash: string | null }>(
      'SELECT body_blob_hash FROM nodes WHERE id = ?', [input.nodeId]);
    if (!previous) throw new Error('node_body_target_missing');
    const bodyBlobHash = hashTextBody(input.content);
    input.driver.execute(
      `UPDATE nodes
       SET sync_dirty = CASE WHEN body_blob_hash IS NOT ? THEN 1 ELSE sync_dirty END,
           content = ?, body_blob_hash = ?, opening_text = ?, updated_at = ?
       WHERE id = ?`,
      [
        bodyBlobHash,
        input.content,
        bodyBlobHash,
        resolveNodeOpeningText(input.content, normalizeNodeTitle(input.title)),
        input.updatedAt,
        input.nodeId
      ]
    );
    enqueueWorkspaceSearchInvalidationForNodeIds(input.driver, [input.nodeId]);
    if (previous?.body_blob_hash && previous.body_blob_hash !== bodyBlobHash) {
      collectTextBodyBlobCandidates(input.driver, [previous.body_blob_hash]);
    }
    return bodyBlobHash;
  });
}
