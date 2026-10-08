import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from './syncNodeGraph.js';
import { validateTopicTextBodies } from './topicTextBodies.js';
import { topicTextSnapshotHash } from './topicTextSnapshotHash.js';
import { availableTextAlternatives, normalizeTextAlternatives } from './topicTextState.js';

export async function mutateTopicText(db: DbPort, input: {
  nodeId: string; alternativeId: string; action: 'promoted' | 'dismissed';
  now: string; versionId: string; hostName: string;
}) {
  return db.transaction(async (tx) => {
    const current = await loadCurrentSyncNodeRecord(tx, input.nodeId);
    if (!current?.version_id || current.snapshot.deleted_at) return unavailable(input);
    const available = availableTextAlternatives(current, input.now);
    const selected = available.find((entry) => entry.id === input.alternativeId);
    if (!selected) return unavailable(input);
    let body = current.body_text ?? current.snapshot.content ?? '';
    if (input.action === 'promoted') {
      const bodies = validateTopicTextBodies(current.snapshot.text_alternatives ?? [], current.alternative_bodies ?? []);
      const selectedBody = bodies.find((value) => value.hash === selected.body_blob_hash);
      if (!selectedBody) throw new Error('text_alternative_body_unavailable');
      body = selectedBody.text;
    }
    const snapshot = { ...current.snapshot, content: body, body_blob_hash: null,
      updated_at: input.now,
      text_selection: input.action === 'promoted'
        ? { version_id: input.versionId, created_at: input.now }
        : current.snapshot.text_selection ?? { version_id: current.version_id, created_at: current.version_created_at! },
      text_alternatives: normalizeTextAlternatives(available.filter((entry) => entry.id !== selected.id), body, input.now)
    };
    const record: NativeSyncNodeRecord = { ...current, snapshot, body_text: body,
      content_hash: topicTextSnapshotHash(snapshot), host_name: input.hostName,
      version_id: input.versionId, version_created_at: input.now, updated_at: input.now,
      parent_version_id: current.version_id, parent_version_ids: [current.version_id],
      ancestor_version_ids: [current.version_id, ...current.ancestor_version_ids] };
    const applied = await applySyncNodesWithDbPort(tx, [record], { operation: 'local_mutation' });
    if (!applied.appliedIds.includes(input.nodeId)) throw new Error('text_alternative_mutation_not_applied');
    await collectNodeVersionPayloads(tx, input.nodeId, Number.MAX_SAFE_INTEGER);
    return { alternative_id: selected.id, node_id: input.nodeId, status: input.action };
  });
}

function unavailable(input: { alternativeId: string }) {
  return { alternative_id: input.alternativeId, node_id: null, status: 'unavailable' as const };
}
