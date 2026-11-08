import { hashTextBody } from '../database/textBodyHash.js';
import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import { isReadingReviewItemNode } from '../review/reviewItemKind.js';

import { advanceCycleFlow } from './cycleFlowAdvance.js';
import { replayCycleHistory } from './cycleFlowHistory.js';
import { assertCycleLearningFacts, persistCycleLearning } from './cycleFlowLearning.js';
import { replayLegacyCycle } from './cycleFlowLegacy.js';
import { chooseCycleCurrent, isCycleCurrentReady, reconcileCycle } from './cycleFlowOpen.js';
import { cycleWindow } from './cycleFlowSelection.js';
import { sameCycleProgress } from './cycleFlowState.js';
import { dailyFlowCommitSchema, type DailyFlowCommitArgs, type DailyFlowSettings } from './dailyFlowContract.js';
import { commitDailyFlowNavigation } from './dailyFlowNavigation.js';
import { flowDay, flowPlan } from './dailyFlowPlanning.js';
import { acceptsRebuiltFlowSource } from './dailyFlowRebuildSource.js';
import { currentFlowLearning, readCurrentFlowLearning } from './dailyFlowReceipt.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import type { DailyFlowStore } from './dailyFlowStore.js';
import { assertDiveCurrent, displayDiveSession, selectDiveCurrent } from './diveCycleFlow.js';
import { resolveEarliestReviewDueAt } from './flowSessionProgress.js';

export async function commitCycleFlow(db: DailyFlowStore, args: DailyFlowCommitArgs, settings: DailyFlowSettings) {
  dailyFlowCommitSchema.parse(args);
  const stored = await db.readState();
  if (args.token.scope !== (settings.scope ?? '')) throw new Error('daily_flow_library_changed');
  const hash = hashTextBody(JSON.stringify(args));
  const ids = [stored?.session.currentNodeId, args.expectedContinueNodeId, args.grade?.nodeId,
    args.reviewHistory?.nodeId, ...(args.readings ?? []).map(value => value.nodeId)];
  const dive = args.sourceSession?.dive;
  if (dive && !args.historyMode && (!stored || stored.day_key !== flowDay(args.now, settings))) {
    throw new Error('daily_flow_changed');
  }
  const replayed = await replayOperation(db, stored, args, hash, settings);
  if (replayed) return replayed;
  if (!stored || stored.day_key !== args.token.dayKey ||
    (stored.revision !== args.token.revision && (!args.sourceSession?.cycle ||
      !sameCycleProgress(args.sourceSession, stored.session) && !acceptsRebuiltFlowSource(stored, args))) ||
    (!args.historyMode && stored.day_key !== flowDay(args.now, settings))) throw new Error('daily_flow_changed');
  if (args.navigation) return commitDailyFlowNavigation(db, stored, args, settings, hash);
  const mode = stored.mode as ReviewSessionMode;
  const invalidated = stored.invalidated || stored.settings_key !== JSON.stringify(settings);
  const base = invalidated
    ? await reconcileCycle(db, stored, args.now, settings) : stored.session;
  if (dive && (args.historyMode || args.navigation || args.nextReadingNodeId || (!args.grade && !args.readingAction))) {
    throw new Error('daily_flow_learning_changed');
  }
  const sourceSession = await resolveCommitSource(db, base, args, mode, settings, Boolean(invalidated));
  const snapshot = await db.scopedLearningSnapshot(ids);
  if (dive) await assertDiveCurrent(db, sourceSession, snapshot, args.now, settings);
  assertCycleLearningFacts(snapshot, args, db.readingPreservesPosition);
  if (args.readingAction && (sourceSession.currentNodeId !== args.readings?.[0]?.nodeId ||
    !isReadingReviewItemNode(snapshot.nodesById[sourceSession.currentNodeId ?? '']) ||
    (!dive && !await isCycleCurrentReady(db, sourceSession, mode, args.now, settings)))) throw new Error('daily_flow_learning_changed');
  if (args.grade && (sourceSession.currentNodeId !== args.grade.nodeId ||
    !flowPlan(snapshot, 'review-first', args.now, settings).fsrsQueueNodeIds.includes(args.grade.nodeId))) {
    throw new Error('daily_flow_learning_changed');
  }
  const historySession = args.historyMode ? args.historySourceSession?.flowFormat === 'legacy-queue-v1'
    ? await replayLegacyCycle(db, base, args, settings) : await replayCycleHistory(db, base, args) : null;
  const { learningChanged, ...result } = await persistCycleLearning(db, args);
  const updated = learningChanged ? await db.scopedLearningSnapshot(ids) : snapshot;
  let session: DailyFlowSession = historySession ?? await advanceCycleFlow(db, sourceSession, args, updated, settings, dive?.mode ?? mode, dive ? base : undefined);
  if (args.reviewHistory?.mode === 'redo') session = { ...session,
    nextReviewDueAt: resolveEarliestReviewDueAt(args.sourceSession?.nextReviewDueAt, result.card?.due) };
  session = cycleWindow(session);
  delete session.rebuildSourceRevision;
  const saved = await db.saveState({ dayKey: stored.day_key, mode, settingsKey: JSON.stringify(settings),
    now: args.now, revision: stored.revision + 1, session });
  await db.saveOperation(args.opId, { input_hash: hash, revision: saved.daily!.revision,
    card_json: result.card === undefined ? null : JSON.stringify(result.card), source_session_json: JSON.stringify(sourceSession) });
  const displayed = dive ? await selectDiveCurrent(db, saved, dive, args.now, settings) : saved;
  return { mode: dive?.mode ?? mode, sourceSession,
    mutationTimestamp: args.now, session: displayed, ...result,
    learning: !dive && db.preparedNavigation?.valid() && db.preparedNavigation.snapshot &&
      (!saved.currentNodeId || db.preparedNavigation.snapshot.nodesById[saved.currentNodeId])
      ? currentFlowLearning(db.preparedNavigation.snapshot, saved.currentNodeId)
      : await readCurrentFlowLearning(db, displayed.currentNodeId),
    ...(args.readings && args.readingAction !== 'soon' ? { readings: args.readings.map(value => ({ nodeId: value.nodeId,
      reading: updated.nodesById[value.nodeId]?.reading ?? null })) } : {}) };
}

async function resolveCommitSource(db: DailyFlowStore, base: DailyFlowSession, args: DailyFlowCommitArgs,
  mode: ReviewSessionMode, settings: DailyFlowSettings, invalidated: boolean) {
  const displayed = args.sourceSession;
  const actionNode = args.grade?.nodeId ?? args.readings?.[0]?.nodeId;
  if (!displayed?.dive && !args.historyMode && (invalidated || (actionNode && actionNode !== base.currentNodeId)) &&
    !await isCycleCurrentReady(db, base, mode, args.now, settings)) {
    await chooseCycleCurrent(db, base, mode, args.now, settings);
  }
  const source = { ...base, isAnswerRevealed: displayed?.isAnswerRevealed ?? base.isAnswerRevealed,
    cycle: { ...base.cycle! } };
  delete source.cycle.change;
  if (!displayed?.dive) return source;
  return { ...displayDiveSession(source, displayed.dive, displayed.currentNodeId, displayed.currentItemStartedAt ?? null),
    isAnswerRevealed: source.isAnswerRevealed };
}

async function replayOperation(db: DailyFlowStore, stored: Awaited<ReturnType<DailyFlowStore['readState']>>,
  args: DailyFlowCommitArgs, hash: string, settings: DailyFlowSettings) {
  const previous = await db.readOperation(args.opId);
  if (previous) {
    if (previous.input_hash !== hash) throw new Error('daily_flow_operation_mismatch');
    if (!stored || stored.invalidated || stored.revision !== previous.revision) throw new Error('daily_flow_ack_superseded');
    const dive = args.sourceSession?.dive;
    const session = dive ? await selectDiveCurrent(db, stored.session, dive, args.now, settings) : stored.session;
    const readings = args.readingAction === 'soon' ? undefined : args.readings;
    const snapshot = readings?.length
      ? await db.learningSnapshot([session.currentNodeId, ...readings.map(value => value.nodeId)].filter((id): id is string => Boolean(id)))
      : session.currentNodeId ? await db.learningSnapshot([session.currentNodeId]) : null;
    return { ...(previous.source_session_json ? { sourceSession: JSON.parse(previous.source_session_json) as DailyFlowSession } : {}), session, replayed: true, mutationTimestamp: args.now,
      ...(!args.navigation ? { mode: dive?.mode ?? stored.mode as ReviewSessionMode } : {}),
      learning: snapshot ? currentFlowLearning(snapshot, session.currentNodeId) : undefined,
      ...(readings ? { readings: readings.map(value => ({ nodeId: value.nodeId,
        reading: snapshot?.nodesById[value.nodeId]?.reading ?? null })) } : {}),
      ...(previous.card_json === null ? {} : { card: JSON.parse(previous.card_json) }) };
  }
  return null;
}
