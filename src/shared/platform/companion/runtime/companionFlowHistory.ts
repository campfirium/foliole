import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { writeNodeReadingObject, writeNodeReviewObject } from '../../../../../lib/core/sync/syncObjectLearningPayloadExecutor';
import type { NativeSyncReviewLogDraft } from '../../../../../lib/platform/nativeSyncContract';
import { isSameReadingProfile } from '../../../../store/workspaceActionHistoryReading';
import { getWorkspaceHistoryTopEntry, moveWorkspaceHistoryCursor } from '../../../../store/workspaceActionHistoryState';
import { createWorkspaceHistoryMutationTimestamp } from '../../../../store/workspaceHistoryTimestamp';
import { resolveWorkspaceReviewHistoryTarget, type FlowHistoryEntry, type HistoryMode } from '../../../../store/workspaceReviewHistoryTarget';
import type { ReviewSessionState } from '../../../../store/workspaceStoreTypes';
import { toReadingPayload, toReviewPayload } from '../../companionSyncStateWriters';
import { getCompanionReadingScope } from '../reading/companionReadingScope';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import { appendCompanionFlowHistory, readCompanionFlowHistory, writeCompanionFlowHistory } from './companionFlowHistoryStore';
import { readIosCompanionDatabase } from './iosCompanionActiveDatabase';
import { saveIosReadingWithDb, saveIosReviewWithDb } from './iosCompanionActiveDatabaseWrites';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';
import { iosCompanionContentHash, iosCompanionHostName, markIosCompanionMutation } from './iosCompanionMutationState';

export async function loadCompanionFlowHistory(key: string) {
  return readIosCompanionDatabase(db => readCompanionFlowHistory(db, key));
}

export function commitCompanionFlowHistory(args: {
  key: string; entry: FlowHistoryEntry; reviewLog?: NativeSyncReviewLogDraft; completedReviewDay?: string;
}) {
  return mutate(async db => {
    await writeEntry(db, args.entry, 'redo', args.entry.beforeContext.reviewSession,
      args.reviewLog, args.completedReviewDay);
    await appendCompanionFlowHistory(db, args.key, args.entry);
    return true;
  });
}

export function replayCompanionFlowHistory(key: string, mode: HistoryMode, session: ReviewSessionState) {
  return mutate(async db => {
    const history = await readCompanionFlowHistory(db, key);
    const entry = getWorkspaceHistoryTopEntry(history, mode);
    if (!entry) return null;
    if (entry.type !== 'review.grade' && entry.type !== 'topic.dismiss') throw new Error('flow_history_unavailable');
    const source = mode === 'undo' ? entry.afterContext : entry.beforeContext;
    const context = await writeEntry(db, entry, mode,
      { ...session, isAnswerRevealed: source.reviewSession.isAnswerRevealed });
    const updated = { ...entry, mutationTimestamp: createWorkspaceHistoryMutationTimestamp(entry.mutationTimestamp) };
    await writeCompanionFlowHistory(db, key, moveWorkspaceHistoryCursor(history, updated, mode));
    return context.reviewSession;
  });
}

function mutate<T>(task: (db: DbPort) => Promise<T>) {
  const owner = getIosCompanionDatabaseOwner();
  const scope = getCompanionReadingScope();
  return runCompanionHighValueMutationTask(() => {
    if (scope !== getCompanionReadingScope() || owner !== getIosCompanionDatabaseOwner()) {
      throw new Error('flow_history_context_changed');
    }
    return owner.runWriter(db => db.transaction(task));
  }, { kind: 'full' });
}

async function writeEntry(db: DbPort, entry: FlowHistoryEntry, mode: HistoryMode,
  reviewSession: ReviewSessionState, reviewLog?: NativeSyncReviewLogDraft, completedReviewDay?: string) {
  const ids = [entry.nodeId, ...(entry.type === 'topic.dismiss' ? entry.relatedReadings ?? [] : []).map(r => r.nodeId)];
  const hostName = await iosCompanionHostName(db);
  const loaded = await Promise.all(ids.map(id => loadCompanionWorkspaceNodeFromDb(db, id, hostName)));
  const nodesById: Record<string, NonNullable<typeof loaded[number]>> = {};
  for (const node of loaded) if (node) nodesById[node.id] = node;
  const trashedNodeIds = loaded.filter(node => node?.deletedAt).map(node => node!.id);
  const target = resolveWorkspaceReviewHistoryTarget({ entry, mode, nodesById, trashedNodeIds, reviewSession });
  if (!target) throw new Error('flow_history_changed');
  for (const [index, id] of ids.entries()) {
    const node = target.nodesById[id]!;
    if (entry.type === 'review.grade') {
      if (!node.review) await clearLearningProfile(db, 'node_review', id);
      else await saveIosReviewWithDb(db, { node_id: id, review_json: JSON.stringify(toReviewPayload(node.review)),
        ...(reviewLog ? { review_log_json: JSON.stringify(reviewLog) } : {}) });
    } else if (isSameReadingProfile(loaded[index]?.reading, node.reading)) continue;
    else if (!node.reading) await clearLearningProfile(db, 'node_reading', id);
    else await saveIosReadingWithDb(db, { node_id: id, reading_json: JSON.stringify(toReadingPayload(node.reading)),
      ...(completedReviewDay && id === entry.nodeId ? { completedReviewDay } : {}) });
  }
  return target.context;
}

async function clearLearningProfile(db: DbPort, objectType: 'node_reading' | 'node_review', nodeId: string) {
  const now = new Date().toISOString();
  const contentHash = await iosCompanionContentHash({ deleted_at: now, node_id: nodeId, object_type: objectType });
  const record = { object_type: objectType, object_id: nodeId, content_hash: contentHash,
    payload_json: '{}', deleted_at: now, updated_at: now };
  if (objectType === 'node_review') await writeNodeReviewObject(db, record);
  else await writeNodeReadingObject(db, record);
  await markIosCompanionMutation({ db, objectType, objectId: nodeId, updatedAt: now,
    hostName: await iosCompanionHostName(db), contentHash });
  await db.run('UPDATE sync_object_state SET deleted_at = ? WHERE object_type = ? AND object_id = ?', [now, objectType, nodeId]);
}
