import { replayCycleHistory } from '../../../../../lib/core/flow/cycleFlowHistory';
import { cycleWindow } from '../../../../../lib/core/flow/cycleFlowSelection';
import { dailyFlowHistoryCommand } from '../../../../../lib/core/flow/dailyFlowHistory';
import { retainDailyFlowRetryAsync } from '../../../../../lib/core/flow/dailyFlowRetry';
import { commitDailyFlow, openDailyFlow } from '../../../../../lib/core/flow/dailyFlowService';
import type { DailyFlowSession } from '../../../../../lib/core/flow/dailyFlowSession';
import { createSqliteDailyFlowStore } from '../../../../../lib/core/flow/dailyFlowSqliteStore';
import { readDailyFlow, saveCycleFlow } from '../../../../../lib/core/flow/dailyFlowStorage';
import type { FlowTiming } from '../../../../../lib/core/flow/flowTiming';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { NativeSyncReviewLogDraft } from '../../../../../lib/platform/nativeSyncContract';
import { toNodeReviewProfile, toSchedulerCard } from '../../../../features/review/model/reviewTypes';
import type { FlowHistoryEntry } from '../../../../store/workspaceReviewHistoryTarget';
import type { ReviewSessionState } from '../../../../store/workspaceStoreTypes';

import { companionDailyFlowPersistence, companionDailyFlowSettings, ownedCompanionDailyFlowPersistence } from './companionDailyFlow';
import { appendCompanionFlowHistory } from './companionFlowHistoryStore';

export async function commitCompanionDailyHistory(db: DbPort, args: { key: string; entry: FlowHistoryEntry;
  reviewLog?: NativeSyncReviewLogDraft; completedReviewDay?: string }, timing?: FlowTiming) {
  const settings = companionDailyFlowSettings();
  const persistence = ownedCompanionDailyFlowPersistence(settings);
  const entry = args.entry;
  const token = entry.beforeContext.reviewSession.daily;
  if (!token) throw new Error('daily_flow_token_missing');
  const common = { opId: entry.id, now: entry.mutationTimestamp, token, sourceSession: entry.beforeContext.reviewSession };
  const result = entry.type === 'review.grade'
    ? await commitDailyFlow(db, await retainDailyFlowRetryAsync({ ...common, grade: { nodeId: entry.nodeId, before: entry.beforeReview,
      grade: args.reviewLog!.grade as 1 | 2 | 3 | 4, reviewedAt: args.reviewLog!.reviewedAt,
      schedulerVersion: args.reviewLog!.schedulerVersion, cardBefore: toSchedulerCard(entry.beforeReview, entry.mutationTimestamp),
      cardAfter: toSchedulerCard(entry.afterReview, entry.mutationTimestamp) } }), settings, persistence, undefined, undefined, timing)
    : await commitDailyFlow(db, await retainDailyFlowRetryAsync({ ...common, ...(entry.title === 'Soon Topic' ? { readingAction: 'soon' as const } : {}),
      ...(entry.title === 'Read Topic' ? { readingAction: 'read' as const }
      : entry.title === 'Later Topic' ? { readingAction: 'later' as const }
      : entry.title === 'Dismiss Topic' ? { readingAction: 'dismiss' as const } : {}), readings: [{ nodeId: entry.nodeId,
      before: entry.beforeReading ?? null, after: entry.afterReading ?? null,
      ...(args.completedReviewDay === undefined ? {} : { completedReviewDay: args.completedReviewDay }) },
    ...(entry.relatedReadings ?? []).map(value => ({ nodeId: value.nodeId,
      before: value.beforeReading ?? null, after: value.afterReading ?? null }))] }),
    settings, persistence, undefined, undefined, timing);
  const saved = { ...entry, ...(result.sourceSession ? { beforeContext: { ...entry.beforeContext, reviewSession: result.sourceSession } } : {}), afterContext: { ...entry.afterContext,
    activeNodeId: result.session.currentNodeId, reviewSession: result.session },
  ...(entry.type === 'review.grade' ? { afterReview: result.card ? toNodeReviewProfile(result.card) : null } : {}) };
  if (!result.replayed) await appendCompanionFlowHistory(db, args.key, saved);
  return result;
}

export async function saveReplayedCompanionDailySession(db: DbPort, session: ReviewSessionState, now: string,
  replay?: { source: ReviewSessionState; after: ReviewSessionState; mode: 'undo' | 'redo' }) {
  if (session.dive) return reopenCompanionDive(db, session, now);
  const state = await readDailyFlow(db);
  if (!state) return session;
  if (!replay || session.flowFormat !== 'cycle-v1' || !session.cycle) {
    const settings = companionDailyFlowSettings();
    return (await openDailyFlow(db, { now, mode: state.mode as 'recommended' | 'review-first' | 'reading-only',
      refresh: true }, settings, ownedCompanionDailyFlowPersistence(settings))).session;
  }
  const restored = await replayCycleHistory(createSqliteDailyFlowStore(db, companionDailyFlowPersistence), state.session, { opId: 'structural-replay', now, token: state.session.daily!,
    historyMode: replay.mode, historySourceSession: replay.source, nextSession: session,
    ...(replay.after.cycle?.change ? { cycleReplay: replay.after.cycle.change } : {}) });
  const window = cycleWindow(restored);
  return saveCycleFlow(db, { dayKey: state.day_key, settingsKey: state.settings_key, mode: state.mode,
    now, revision: state.revision + 1, session: window });
}

/** Continues the Dive from this session: its current card stays while ready, otherwise the Dive moves on. */
export async function reopenCompanionDive(db: DbPort, session: ReviewSessionState, now: string) {
  const dive = session.dive!;
  const settings = companionDailyFlowSettings();
  return (await openDailyFlow(db, { now, mode: dive.mode, dive: { id: dive.id, topicIds: dive.topicIds }, seed: session as DailyFlowSession },
    settings, ownedCompanionDailyFlowPersistence(settings))).session;
}

export async function replayCompanionDailyHistory(db: DbPort, args: { session: ReviewSessionState;
  entry: FlowHistoryEntry; mode: 'undo' | 'redo'; now: string }) {
  return commitDailyFlow(db, await retainDailyFlowRetryAsync(dailyFlowHistoryCommand(args)),
    companionDailyFlowSettings(), companionDailyFlowPersistence);
}
