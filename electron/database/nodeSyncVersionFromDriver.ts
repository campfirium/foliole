import { randomUUID } from 'node:crypto';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { collectNodeVersionChainWithDriver } from '../../lib/core/database/nodeVersionChainRetention.js';
import { loadTopicTextBodiesWithDriver } from '../../lib/core/database/topicTextBodiesWithDriver.js';
import { publishLocalNodePositionWithDriver } from '../../lib/core/sync/nodeVersionMemberPositionPublish.js';
import { createOpaqueVersionRef } from '../../lib/core/sync/opaqueSyncRefs.js';

import { upsertNodeSyncState } from './nodeSyncStateRows.js';
import { prepareNodeSyncVersionFromDriver } from './nodeSyncVersionPreparedFromDriver.js';

export function flushNodeSyncVersionWithDriver(
  driver: DatabaseDriver,
  nodeId: string,
  hostName: string,
  now = new Date().toISOString(),
  versionId?: string
): string | null {
  let createdVersionId: string | null = null;
  driver.transaction(() => {
    const prepared = prepareNodeSyncVersionFromDriver(driver, nodeId);
    if (!prepared) return;
    const { row, body, snapshot, contentHash } = prepared;
    const resolvedVersionId = versionId ?? createOpaqueVersionRef(randomUUID());
    driver.execute(
      `INSERT INTO node_sync_versions (
         version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [resolvedVersionId, row.id, row.current_version_id, hostName, now, contentHash, body,
        JSON.stringify({ ...snapshot,
          ...(snapshot.text_alternatives.length ? {
            text_alternative_bodies: loadTopicTextBodiesWithDriver(driver, nodeId, snapshot.text_alternatives)
          } : {}),
          text_selection: { version_id: resolvedVersionId, created_at: now } })]
    );
    driver.execute('INSERT INTO node_version_local_origins (version_id) VALUES (?)', [resolvedVersionId]);
    if (row.current_version_id) {
      driver.execute(
        `INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal) VALUES (?, ?, 0)`,
        [resolvedVersionId, row.current_version_id]
      );
    }
    driver.execute(
      `UPDATE nodes SET current_version_id = ?, last_modified_by_host_name = ?, sync_dirty = 0 WHERE id = ?`,
      [resolvedVersionId, hostName, row.id]
    );
    upsertNodeSyncState({
      contentHash,
      currentVersionId: resolvedVersionId,
      deletedAt: row.deleted_at,
      hostName,
      nodeId: row.id,
      updatedAt: row.updated_at
    }, driver);
    driver.execute('UPDATE node_version_local_proof_state SET proof_revision = proof_revision + 1 WHERE singleton_id = 1');
    publishLocalNodePositionWithDriver(driver, nodeId);
    collectNodeVersionChainWithDriver(driver, nodeId);
    createdVersionId = resolvedVersionId;
  });
  return createdVersionId;
}
