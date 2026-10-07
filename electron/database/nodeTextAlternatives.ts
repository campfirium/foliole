import { randomUUID } from 'node:crypto';

import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { loadNodeConsumerBody } from '../../lib/core/database/nodeConsumerBodyResolution.js';
import { loadTopicTextBodiesWithDriver } from '../../lib/core/database/topicTextBodiesWithDriver.js';
import { loadTopicTextStateWithDriver } from '../../lib/core/database/topicTextStateWithDriver.js';
import { createOpaqueVersionRef } from '../../lib/core/sync/opaqueSyncRefs.js';
import { expireTopicText } from '../../lib/core/sync/topicTextExpiry.js';
import { mutateTopicText } from '../../lib/core/sync/topicTextMutation.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';

export async function loadNodeTextAlternativePreview(nodeId: string, alternativeId?: string, storage: 'continuous' | 'chunked' = 'continuous') {
  const connection = openDatabaseConnection();
  await expireTopicText(createBetterSqliteDbPort(connection.sqlite), nodeId, new Date().toISOString());
  return loadNodeTextAlternativePreviewWithDriver(connection.driver, nodeId, alternativeId, storage);
}

export function loadNodeTextAlternativePreviewWithDriver(
  driver: DatabaseDriver, nodeId: string, alternativeId?: string, storage: 'continuous' | 'chunked' = 'continuous'
) {
  const now = new Date().toISOString();
  const alternatives = loadTopicTextStateWithDriver(driver, nodeId).filter((entry) => entry.expires_at > now);
  const selected = (alternativeId ? alternatives.find((entry) => entry.id === alternativeId) : null) ?? alternatives[0];
  if (!selected) return null;
  const row = driver.queryOne<NodeBodyRow & DatabaseRow>(
    `SELECT ${storage === 'continuous' ? 'n.content, n.body_blob_hash, cbd.data AS body_blob_data' : "'' AS content, n.body_blob_hash, NULL AS body_blob_data"} FROM nodes n
     ${storage === 'continuous' ? 'LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash' : ''} WHERE n.id = ? AND n.deleted_at IS NULL`, [nodeId]);
  if (!row) return null;
  const body = storage === 'continuous' ? resolveNodeBody(row) : loadNodeConsumerBody(driver, nodeId, storage);
  if (!body) return null;
  if (body.status === 'unavailable') return null;
  const selectedBody = loadTopicTextBodiesWithDriver(driver, [selected], storage)[0]!;
  return {
    alternative_id: selected.id, alternatives, checked_at: now,
    current_content: body.content, current_highlight_count: 0, kind: 'sync_alternative' as const,
    source_node_id: nodeId, updated_content: selectedBody.text, updated_highlight_count: 0
  };
}

export function dismissNodeTextAlternative(alternativeId: string) {
  return updateAlternative(alternativeId, 'dismissed');
}

export function promoteNodeTextAlternative(alternativeId: string) {
  return updateAlternative(alternativeId, 'promoted');
}

async function updateAlternative(alternativeId: string, action: 'dismissed' | 'promoted') {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'mutate-topic-text' });
  return port.transaction(async (tx) => {
    const [node] = await tx.query<{ id: string }>(
      `SELECT n.id FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id,
       json_each(v.snapshot_json, '$.text_alternatives') entry
       WHERE json_extract(entry.value, '$.id') = ? AND n.deleted_at IS NULL`, [alternativeId]);
    if (!node) return { alternative_id: alternativeId, node_id: null, status: 'unavailable' as const };
    return mutateTopicText(tx, { nodeId: node.id, alternativeId, action, now: new Date().toISOString(),
      versionId: createOpaqueVersionRef(randomUUID()), hostName: 'desktop-text-selection' });
  });
}
