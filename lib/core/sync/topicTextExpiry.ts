import type { DbPort } from './dbPort.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from './syncNodeGraph.js';
import { buildResolutionRecord } from './syncNodeResolution.js';
import { availableTextAlternatives, textAlternatives } from './topicTextState.js';

/** Expiration changes the whole version, so stale peers cannot restore removed attachments. */
export async function expireTopicText(db: DbPort, nodeId: string, now: string) {
  return db.transaction(async (tx) => {
    const [expired] = await tx.query<{ id: string }>(
      `SELECT n.id FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id,
       json_each(v.snapshot_json, '$.text_alternatives') entry
       WHERE n.id = ? AND json_extract(entry.value, '$.expires_at') <= ? LIMIT 1`, [nodeId, now]);
    if (!expired) return;
    const current = await loadCurrentSyncNodeRecord(tx, nodeId, false);
    if (!current || current.snapshot.kind !== 'topic') return;
    const retained = availableTextAlternatives(current, now);
    if (retained.length === textAlternatives(current).length) return;
    const record = buildResolutionRecord([current], current, current.body_text ?? '', {
      ...current.snapshot, text_alternatives: retained
    });
    const result = await applySyncNodesWithDbPort(tx, [record], { operation: 'local_mutation' });
    if (!result.appliedIds.includes(nodeId)) throw new Error('text_alternative_expiry_not_applied');
    await collectNodeVersionPayloads(tx, nodeId, Number.MAX_SAFE_INTEGER);
  });
}
