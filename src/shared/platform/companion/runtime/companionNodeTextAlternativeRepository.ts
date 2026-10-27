import { createOpaqueVersionRef } from '../../../../../lib/core/sync/opaqueSyncRefs';
import { readTopicTextSnapshot } from '../../../../../lib/core/sync/topicTextBodies';
import { expireTopicText, findTopicsWithExpiredText } from '../../../../../lib/core/sync/topicTextExpiry';
import { mutateTopicText } from '../../../../../lib/core/sync/topicTextMutation';
import { textAlternativesSchema, type TopicTextAlternative } from '../../../../../lib/core/sync/topicTextState';
import { createCompanionUuid } from '../../companionUuid';
import { isAvailableNativeCompanionRuntime } from '../../companionWorkspaceRuntimeRepository';
import { runCompanionHighValueMutationTask, runCompanionOptionalHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import { readIosCompanionDatabase, writeIosCompanionDatabase } from './iosCompanionActiveDatabase';
import { iosCompanionHostName } from './iosCompanionMutationState';

export interface CompanionNodeTextAlternative {
  alternative_id: string;
  alternatives?: TopicTextAlternative[];
  body_text: string;
  created_at: string;
  node_id: string;
  source_host_name: string;
  source_version_id: string;
  status: 'available' | 'dismissed' | 'promoted' | 'superseded';
  updated_at: string;
}

export async function loadCompanionNodeTextAlternative(nodeId: string, alternativeId?: string) {
  if (!isAvailableNativeCompanionRuntime()) return null;
  const now = new Date().toISOString();
  const expired = await readIosCompanionDatabase(db => findTopicsWithExpiredText(db, [nodeId], now));
  if (expired.has(nodeId)) await runCompanionOptionalHighValueMutationTask(() => writeIosCompanionDatabase(async db =>
    await expireTopicText(db, nodeId, now) ? true : null), { kind: 'full' });
  return readIosCompanionDatabase(async (db) => {
    const [record] = await db.query<{ snapshot_json: string; version_id: string; updated_at: string }>(
      `SELECT v.snapshot_json, v.version_id, n.updated_at
       FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id
       WHERE n.id = ? AND n.deleted_at IS NULL`, [nodeId]);
    if (!record) return null;
    const stored = readTopicTextSnapshot(record.snapshot_json);
    const alternatives = textAlternativesSchema.parse(stored.snapshot.text_alternatives ?? [])
      .filter((entry) => entry.expires_at > now);
    const selected = alternatives.find((entry) => entry.id === alternativeId) ?? alternatives[0];
    if (!selected) return null;
    const body = stored.bodies.find((entry) => entry.hash === selected.body_blob_hash)!;
    return { alternative_id: selected.id, alternatives, body_text: body.text,
      created_at: selected.created_at, node_id: nodeId, source_host_name: selected.source_host_name,
      source_version_id: record.version_id!, status: 'available' as const, updated_at: record.updated_at };
  });
}

export async function updateCompanionNodeTextAlternativeStatus(nodeId: string, alternativeId: string, status: 'dismissed' | 'promoted') {
  return runCompanionHighValueMutationTask(() => writeIosCompanionDatabase((db) => db.transaction(async (tx) => {
    const [node] = await tx.query<{ id: string }>(
      `SELECT n.id FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id,
       json_each(v.snapshot_json, '$.text_alternatives') entry
       WHERE n.id = ? AND json_extract(entry.value, '$.id') = ? AND n.deleted_at IS NULL`, [nodeId, alternativeId]);
    if (!node) throw new Error('text_alternative_unavailable');
    return mutateTopicText(tx, { nodeId: node.id, alternativeId, action: status,
      now: new Date().toISOString(), versionId: createOpaqueVersionRef(createCompanionUuid()),
      hostName: await iosCompanionHostName(tx) });
  })), { kind: 'full' });
}
