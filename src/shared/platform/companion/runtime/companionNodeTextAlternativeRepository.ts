import { createOpaqueVersionRef } from '../../../../../lib/core/sync/opaqueSyncRefs';
import { loadTopicTextBody } from '../../../../../lib/core/sync/topicTextBodies';
import { expireTopicText } from '../../../../../lib/core/sync/topicTextExpiry';
import { mutateTopicText } from '../../../../../lib/core/sync/topicTextMutation';
import { textAlternativesSchema, type TopicTextAlternative } from '../../../../../lib/core/sync/topicTextState';
import { createCompanionUuid } from '../../companionUuid';
import { isAvailableNativeCompanionRuntime } from '../../companionWorkspaceRuntimeRepository';

import { writeIosCompanionDatabase } from './iosCompanionActiveDatabase';
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
  return writeIosCompanionDatabase(async (db) => {
    const now = new Date().toISOString();
    await expireTopicText(db, nodeId, now);
    const [record] = await db.query<{ alternatives: string | null; version_id: string; updated_at: string }>(
      `SELECT json_extract(v.snapshot_json, '$.text_alternatives') AS alternatives, v.version_id, n.updated_at
       FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id
       WHERE n.id = ? AND n.deleted_at IS NULL`, [nodeId]);
    if (!record) return null;
    const alternatives = textAlternativesSchema.parse(JSON.parse(record.alternatives ?? '[]'))
      .filter((entry) => entry.expires_at > now);
    const selected = alternatives.find((entry) => entry.id === alternativeId) ?? alternatives[0];
    if (!selected) return null;
    const body = await loadTopicTextBody(db, selected);
    return { alternative_id: selected.id, alternatives, body_text: body.text,
      created_at: selected.created_at, node_id: nodeId, source_host_name: selected.source_host_name,
      source_version_id: record.version_id!, status: 'available' as const, updated_at: record.updated_at };
  });
}

export async function updateCompanionNodeTextAlternativeStatus(alternativeId: string, status: 'dismissed' | 'promoted') {
  return writeIosCompanionDatabase((db) => db.transaction(async (tx) => {
    const [node] = await tx.query<{ id: string }>(
      `SELECT n.id FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id,
       json_each(v.snapshot_json, '$.text_alternatives') entry
       WHERE json_extract(entry.value, '$.id') = ? AND n.deleted_at IS NULL`, [alternativeId]);
    if (!node) throw new Error('text_alternative_unavailable');
    return mutateTopicText(tx, { nodeId: node.id, alternativeId, action: status,
      now: new Date().toISOString(), versionId: createOpaqueVersionRef(createCompanionUuid()),
      hostName: await iosCompanionHostName(tx) });
  }));
}
