import { createHash } from 'node:crypto';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { readSplitTopicAnchors } from '../../lib/core/database/splitTopicAnchorMigration.js';
import type { NativeSplitTopicPreview } from '../../lib/platform/nativeNodeMutationContract.js';

import { openDatabaseConnection } from './connection.js';
import { withTransaction } from './transaction.js';

export function readSplitTopicSource(driver: DatabaseDriver, sourceNodeId: string) {
  const source = driver.queryOne<{ parentNodeId: string | null; content: string }>(
    `WITH RECURSIVE source AS (
       SELECT id, parent_id, content FROM nodes WHERE id = ? AND kind = 'topic' AND deleted_at IS NULL
     ), live_path(id, parent_id) AS (
       SELECT id, parent_id FROM source
       UNION
       SELECT parent.id, parent.parent_id FROM nodes parent
       JOIN live_path ON parent.id = live_path.parent_id
       WHERE parent.deleted_at IS NULL
     ) SELECT parent_id AS parentNodeId, content FROM source
       WHERE EXISTS (SELECT 1 FROM live_path WHERE parent_id IS NULL)`,
    [sourceNodeId]
  );
  if (!source) return null;
  const anchors = readSplitTopicAnchors(driver, sourceNodeId);
  const revision = createHash('sha256')
    .update(JSON.stringify([sourceNodeId, source.parentNodeId, anchors]))
    .update(source.content)
    .digest('hex');
  const preview: NativeSplitTopicPreview = { ...source, revision };
  return { anchors, preview };
}

export function loadSplitTopicPreview(sourceNodeId: string): NativeSplitTopicPreview | null {
  const { driver } = openDatabaseConnection();
  return withTransaction(driver, () => readSplitTopicSource(driver, sourceNodeId)?.preview ?? null);
}
