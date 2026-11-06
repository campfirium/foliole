import { createOpaqueVersionRef } from '../../../../../lib/core/sync/opaqueSyncRefs';
import { validateTopicAlternativeRecord, type TopicAlternativeRecord } from '../../../../../lib/core/sync/topicAlternativeRecord';
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
    const alternatives = textAlternativesSchema.parse(await db.query(`SELECT entry.alternative_id AS id,
      entry.body_blob_hash, entry.source_host_name, entry.created_at, entry.expires_at
      FROM node_text_alternatives entry JOIN nodes n ON n.id = entry.node_id
      WHERE entry.node_id = ? AND entry.status = 'available' AND entry.expires_at > ? AND n.deleted_at IS NULL
      ORDER BY entry.created_at DESC, entry.alternative_id DESC`, [nodeId, now]));
    const selected = alternatives.find(entry => entry.id === alternativeId) ?? alternatives[0];
    if (!selected) return null;
    const [row] = await db.query<TopicAlternativeRecord>(
      'SELECT * FROM node_text_alternatives WHERE node_id = ? AND alternative_id = ?', [nodeId, selected.id]);
    const body = validateTopicAlternativeRecord(row);
    return { alternative_id: selected.id, alternatives, body_text: body.body_text,
      created_at: selected.created_at, node_id: nodeId, source_host_name: selected.source_host_name,
      source_version_id: body.source_version_id, status: 'available' as const, updated_at: body.updated_at };
  });
}

export async function updateCompanionNodeTextAlternativeStatus(nodeId: string, alternativeId: string, status: 'dismissed' | 'promoted') {
  return runCompanionHighValueMutationTask(() => writeIosCompanionDatabase((db) => db.transaction(async (tx) => {
    const [node] = await tx.query<{ id: string }>(
      `SELECT n.id FROM nodes n JOIN node_text_alternatives entry ON entry.node_id = n.id
       WHERE n.id = ? AND entry.alternative_id = ? AND entry.status = 'available' AND n.deleted_at IS NULL`, [nodeId, alternativeId]);
    if (!node) throw new Error('text_alternative_unavailable');
    return mutateTopicText(tx, { nodeId: node.id, alternativeId, action: status,
      now: new Date().toISOString(), versionId: createOpaqueVersionRef(createCompanionUuid()),
      hostName: await iosCompanionHostName(tx) }, { enqueueSearchInvalidations: false });
  })), { kind: 'full' });
}
