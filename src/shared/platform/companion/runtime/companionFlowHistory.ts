import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { recordReviewHistoryWithDb } from '../../../../../lib/core/database/reviewLogRecord';
import { recomputeNodeReviewWithDb } from '../../../../../lib/core/database/reviewProjection';
import type { WorkspaceRefreshScope } from '../../../../../lib/core/database/workspaceSnapshotRefresh';
import { readLegacyCycleProjection } from '../../../../../lib/core/flow/cycleFlowLegacy';
import { settleDailyFlowRetry } from '../../../../../lib/core/flow/dailyFlowRetry';
import { retainLegacyHistoryEncoding } from '../../../../../lib/core/flow/flowHistoryEntry';
import { restoreFlowHistoryEntryAsync } from '../../../../../lib/core/flow/flowHistoryEntryAsync';
import { reviewHistoryOpId } from '../../../../../lib/core/review/reviewEventIdentity';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { NativeSyncReviewLogDraft } from '../../../../../lib/platform/nativeSyncContract';
import type { ReviewSessionMode } from '../../../../features/review/model/reviewSessionMode';
import { isSameReadingProfile } from '../../../../store/workspaceActionHistoryReading';
import { getWorkspaceHistoryTopEntry, moveWorkspaceHistoryCursor } from '../../../../store/workspaceActionHistoryState';
import { createWorkspaceHistoryMutationTimestamp } from '../../../../store/workspaceHistoryTimestamp';
import { resolveWorkspaceReviewHistoryTarget, type FlowHistoryEntry, type HistoryMode } from '../../../../store/workspaceReviewHistoryTarget';
import { resolveEarliestReviewDueAt } from '../../../../store/workspaceReviewSessionProgress';
import type { ReviewSessionState } from '../../../../store/workspaceStoreTypes';
import { toReadingPayload, toReviewPayload } from '../../companionSyncStateWriters';
import { getCompanionReadingScope } from '../reading/companionReadingScope';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import { companionDailyFlowPersistence, companionDailyFlowSettings } from './companionDailyFlow';
import { commitCompanionDailyHistory, replayCompanionDailyHistory, saveReplayedCompanionDailySession } from './companionDailyFlowHistory';
import { readCompanionFlowHistory, writeCompanionFlowHistory, type CompanionWorkspaceHistoryEntry } from './companionFlowHistoryStore';
import { clearCompanionHistoryLearning } from './companionHistoryLearning';
import { readCompanionHistoryReplayReceipt } from './companionHistoryReplayReceipt';
import { replayCompanionNodeHistoryWithDb } from './companionNodeHistory';
import { readIosCompanionDatabase } from './iosCompanionActiveDatabase';
import { saveIosReadingWithDb, saveIosReviewWithDb } from './iosCompanionActiveDatabaseWrites';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';
import { iosCompanionHostName } from './iosCompanionMutationState';

export async function loadCompanionFlowHistory(key: string) {
  return readIosCompanionDatabase(db => readCompanionFlowHistory(db, key));
}

export { loadCompanionFlowHistoryAvailability } from './companionHistoryAvailability';

export function commitCompanionFlowHistory(args: {
  key: string; mode: ReviewSessionMode; entry: FlowHistoryEntry; reviewLog?: NativeSyncReviewLogDraft; completedReviewDay?: string;
}) {
  return runCompanionHistoryMutation(async db => {
    if (args.entry.beforeContext.reviewSession.daily) return commitCompanionDailyHistory(db, args);
    throw new Error('daily_flow_not_open');
  }, flowHistoryRefreshScope(args.entry)).then(result => {
    if (args.entry.beforeContext.reviewSession.daily) settleDailyFlowRetry(args.entry.id);
    return result;
  });
}

export async function replayCompanionFlowHistory(key: string, mode: HistoryMode, session: ReviewSessionState,
  requestId: string = crypto.randomUUID()) {
  const result = await runCompanionHistoryMutation(async db => {
    const history = await readCompanionFlowHistory(db, key);
    const replayed = await readCompanionHistoryReplayReceipt(db, history, requestId, session);
    if (replayed) return { session: replayed, entry: null };
    const saved = getWorkspaceHistoryTopEntry(history, mode);
    if (!saved) return null;
    const sourceSession = saved.type === 'nodes.change' ? saved.beforeSession : saved.beforeContext.reviewSession;
    const projection = session.cycle && sourceSession?.flowFormat === 'legacy-queue-v1'
      ? await readLegacyCycleProjection(db, companionDailyFlowSettings(), companionDailyFlowPersistence, new Date().toISOString()) : session;
    const entry = await restoreFlowHistoryEntryAsync(saved, projection);
    if (entry.type === 'nodes.change') {
      await replayCompanionNodeHistoryWithDb(db, entry, mode);
      const restored = await saveReplayedCompanionDailySession(db, (mode === 'undo' ? entry.beforeSession : entry.afterSession) ?? session, new Date().toISOString(),
        entry.beforeSession?.cycle && entry.afterSession?.cycle ? { source: (mode === 'undo' ? entry.afterSession : entry.beforeSession),
          after: entry.afterSession, mode } : undefined);
      await writeCompanionFlowHistory(db, key, { ...moveWorkspaceHistoryCursor(history, retainLegacyHistoryEncoding(saved, entry), mode),
        replayReceipt: { id: requestId, mode, ...(restored.daily ? { daily: restored.daily } : {}) } });
      return { session: restored, entry };
    }
    if (entry.type !== 'review.grade' && entry.type !== 'topic.dismiss') throw new Error('flow_history_unavailable');
    const source = mode === 'undo' ? entry.afterContext : entry.beforeContext;
    let mutationTimestamp = createWorkspaceHistoryMutationTimestamp(entry.mutationTimestamp);
    let daily: ReviewSessionState | undefined;
    const current = { ...projection, isAnswerRevealed: source.reviewSession.isAnswerRevealed };
    if (session.daily) {
      // The shared daily owner validates operation identity and live facts after peer synchronization.
      const saved = await replayCompanionDailyHistory(db, { entry, session, mode, now: mutationTimestamp });
      daily = saved.session;
      mutationTimestamp = saved.mutationTimestamp ?? mutationTimestamp;
    } else await writeEntry(db, entry, mode, current, undefined, undefined, mutationTimestamp);
    const updated = { ...await withCurrentReview(db, entry, mode), mutationTimestamp,
      ...(entry.type === 'review.grade' && mode === 'redo'
        ? { reviewOpId: reviewHistoryOpId(entry.reviewOpId ?? entry.id, mutationTimestamp, 'redo') } : {}) };
    const restored = daily ?? await saveReplayedCompanionDailySession(db, (mode === 'undo' ? updated.beforeContext : updated.afterContext).reviewSession, mutationTimestamp);
    await writeCompanionFlowHistory(db, key, { ...moveWorkspaceHistoryCursor(history, retainLegacyHistoryEncoding(saved, updated), mode),
      replayReceipt: { id: requestId, mode, ...(restored.daily ? { daily: restored.daily } : {}) } });
    return { session: restored, entry: updated };
  }, result => result?.entry ? flowHistoryRefreshScope(result.entry) : { kind: 'nodes', nodeIds: [] });
  return result?.session ?? null;
}

function flowHistoryRefreshScope(entry: CompanionWorkspaceHistoryEntry): WorkspaceRefreshScope {
  if (entry.type === 'nodes.change') return { kind: 'nodes', nodeIds: entry.changes.map(change => change.nodeId), structure: true };
  if (entry.type === 'review.grade') return { kind: 'nodes', nodeIds: [], reviewNodeIds: [entry.nodeId] };
  const readings = [{ nodeId: entry.nodeId, beforeReading: entry.beforeReading, afterReading: entry.afterReading },
    ...(entry.relatedReadings ?? [])];
  return { kind: 'nodes', nodeIds: [], readingNodeIds: readings
    .filter(reading => !isSameReadingProfile(reading.beforeReading, reading.afterReading)).map(reading => reading.nodeId) };
}

export function runCompanionHistoryMutation<T>(task: (db: DbPort) => Promise<T>,
  refreshScope: WorkspaceRefreshScope | ((result: T) => WorkspaceRefreshScope) = { kind: 'full' }) {
  const owner = getIosCompanionDatabaseOwner();
  const scope = getCompanionReadingScope();
  return runCompanionHighValueMutationTask(() => {
    if (scope !== getCompanionReadingScope() || owner !== getIosCompanionDatabaseOwner()) {
      throw new Error('flow_history_context_changed');
    }
    return owner.runWriter(db => db.transaction(task));
  }, refreshScope);
}

async function writeEntry(db: DbPort, entry: FlowHistoryEntry, mode: HistoryMode,
  reviewSession: ReviewSessionState, reviewLog?: NativeSyncReviewLogDraft, completedReviewDay?: string, mutationTimestamp = entry.mutationTimestamp) {
  const { ids, loaded, target } = await prepareEntry(db, entry, mode, reviewSession);
  const hostName = await iosCompanionHostName(db);
  for (const [index, id] of ids.entries()) {
    const node = target.nodesById[id]!;
    if (entry.type === 'review.grade') {
      if (reviewLog) await saveIosReviewWithDb(db, { node_id: id,
        review_json: JSON.stringify(node.review ? toReviewPayload(node.review) : {}), review_log_json: JSON.stringify(reviewLog) });
      else {
        const inserted = await recordReviewHistoryWithDb(db, { nodeId: id, hostName,
          history: { mode, targetOpId: entry.reviewOpId ?? entry.id },
          opId: reviewHistoryOpId(entry.reviewOpId ?? entry.id, mutationTimestamp, mode), updatedAt: mutationTimestamp });
        if (inserted) await recomputeNodeReviewWithDb(db, id);
      }
    } else if (isSameReadingProfile(loaded[index]?.reading, node.reading)) continue;
    else if (!node.reading) await clearCompanionHistoryLearning(db, 'node_reading', id);
    else await saveIosReadingWithDb(db, { node_id: id, reading_json: JSON.stringify(toReadingPayload(node.reading)),
      ...(completedReviewDay && id === entry.nodeId ? { completedReviewDay } : {}) });
  }
  return target.context;
}

async function prepareEntry(db: DbPort, entry: FlowHistoryEntry, mode: HistoryMode, reviewSession: ReviewSessionState) {
  const ids = [entry.nodeId, ...(entry.type === 'topic.dismiss' ? entry.relatedReadings ?? [] : []).map(r => r.nodeId)];
  const hostName = await iosCompanionHostName(db);
  const loaded = await Promise.all(ids.map(id => loadCompanionWorkspaceNodeFromDb(db, id, hostName)));
  const nodesById: Record<string, NonNullable<typeof loaded[number]>> = {};
  for (const node of loaded) if (node) nodesById[node.id] = node;
  const trashedNodeIds = loaded.filter(node => node?.deletedAt).map(node => node!.id);
  const target = resolveWorkspaceReviewHistoryTarget({ entry, mode, nodesById, trashedNodeIds, reviewSession });
  if (!target) throw new Error('flow_history_changed');
  return { ids, loaded, target };
}

async function withCurrentReview(db: DbPort, entry: FlowHistoryEntry, mode: HistoryMode): Promise<FlowHistoryEntry> {
  if (entry.type !== 'review.grade') return entry;
  const node = await loadCompanionWorkspaceNodeFromDb(db, entry.nodeId, await iosCompanionHostName(db));
  return { ...entry, ...(mode === 'undo' ? { beforeReview: node?.review ?? null } : {
    afterReview: node?.review ?? null, afterContext: { ...entry.afterContext,
      reviewSession: { ...entry.afterContext.reviewSession, nextReviewDueAt: resolveEarliestReviewDueAt(entry.beforeContext.reviewSession.nextReviewDueAt, node?.review?.due) } } }) };
}
