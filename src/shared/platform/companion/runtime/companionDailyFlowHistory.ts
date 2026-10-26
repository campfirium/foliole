import { retainDailyFlowRetry } from '../../../../../lib/core/flow/dailyFlowRetry';
import { commitDailyFlow } from '../../../../../lib/core/flow/dailyFlowService';
import { readDailyFlow, writeDailyFlow } from '../../../../../lib/core/flow/dailyFlowStorage';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { NativeSyncReviewLogDraft } from '../../../../../lib/platform/nativeSyncContract';
import { toNodeReviewProfile, toSchedulerCard } from '../../../../features/review/model/reviewTypes';
import type { FlowHistoryEntry } from '../../../../store/workspaceReviewHistoryTarget';
import type { ReviewSessionState } from '../../../../store/workspaceStoreTypes';

import { companionDailyFlowPersistence, companionDailyFlowSettings } from './companionDailyFlow';
import { appendCompanionFlowHistory } from './companionFlowHistoryStore';

export async function commitCompanionDailyHistory(db: DbPort, args: { key: string; entry: FlowHistoryEntry;
  reviewLog?: NativeSyncReviewLogDraft; completedReviewDay?: string }) {
  const entry = args.entry;
  const token = entry.beforeContext.reviewSession.daily;
  if (!token) throw new Error('daily_flow_token_missing');
  const common = { opId: entry.id, now: entry.mutationTimestamp, token, sourceSession: entry.beforeContext.reviewSession, nextSession: entry.afterContext.reviewSession };
  const result = entry.type === 'review.grade'
    ? await commitDailyFlow(db, retainDailyFlowRetry({ ...common, grade: { nodeId: entry.nodeId, before: entry.beforeReview,
      grade: args.reviewLog!.grade as 1 | 2 | 3 | 4, reviewedAt: args.reviewLog!.reviewedAt,
      schedulerVersion: args.reviewLog!.schedulerVersion, cardBefore: toSchedulerCard(entry.beforeReview, entry.mutationTimestamp),
      cardAfter: toSchedulerCard(entry.afterReview, entry.mutationTimestamp) } }), companionDailyFlowSettings(), companionDailyFlowPersistence)
    : await commitDailyFlow(db, retainDailyFlowRetry({ ...common, readings: [{ nodeId: entry.nodeId,
      before: entry.beforeReading ?? null, after: entry.afterReading ?? null,
      ...(args.completedReviewDay === undefined ? {} : { completedReviewDay: args.completedReviewDay }) },
    ...(entry.relatedReadings ?? []).map(value => ({ nodeId: value.nodeId,
      before: value.beforeReading ?? null, after: value.afterReading ?? null }))] }),
    companionDailyFlowSettings(), companionDailyFlowPersistence);
  const saved = { ...entry, afterContext: { ...entry.afterContext,
    activeNodeId: result.session.currentNodeId, reviewSession: result.session },
  ...(entry.type === 'review.grade' ? { afterReview: result.card ? toNodeReviewProfile(result.card) : null } : {}) };
  if (!result.replayed) await appendCompanionFlowHistory(db, args.key, saved);
  return result;
}

export async function saveReplayedCompanionDailySession(db: DbPort, session: ReviewSessionState, now: string) {
  const state = await readDailyFlow(db);
  if (!state) return session;
  return writeDailyFlow(db, { dayKey: state.day_key, settingsKey: state.settings_key, mode: state.mode,
    now, revision: state.revision + 1, session });
}
