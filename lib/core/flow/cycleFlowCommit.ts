import { hashTextBody } from '../database/textBodyHash.js';
import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import { isReadingReviewItemNode } from '../review/reviewItemKind.js';
import type { DbPort } from '../sync/dbPort.js';

import { advanceCycleFlow } from './cycleFlowAdvance.js';
import { cycleStamp } from './cycleFlowFingerprint.js';
import { replayCycleHistory } from './cycleFlowHistory.js';
import { assertCycleLearningFacts, persistCycleLearning } from './cycleFlowLearning.js';
import { replayLegacyCycle } from './cycleFlowLegacy.js';
import { chooseCycleCurrent, isCycleCurrentReady, reconcileCycle } from './cycleFlowOpen.js';
import { cycleWindow } from './cycleFlowSelection.js';
import { dailyFlowCommitSchema, type DailyFlowCommitArgs, type DailyFlowSettings } from './dailyFlowContract.js';
import { scopedDailySnapshot } from './dailyFlowGrade.js';
import { commitDailyFlowNavigation } from './dailyFlowNavigation.js';
import { flowDay, flowPlan } from './dailyFlowPlanning.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { readDailyFlow, saveCycleFlow } from './dailyFlowStorage.js';
import { resolveEarliestReviewDueAt } from './flowSessionProgress.js';

export async function commitCycleFlow(db: DbPort, args: DailyFlowCommitArgs, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence) {
  dailyFlowCommitSchema.parse(args);
  const stored = await readDailyFlow(db);
  if (args.token.scope !== (settings.scope ?? '')) throw new Error('daily_flow_library_changed');
  const hash = hashTextBody(JSON.stringify(args));
  const ids = [stored?.session.currentNodeId, args.expectedContinueNodeId, args.grade?.nodeId,
    args.reviewHistory?.nodeId, ...(args.readings ?? []).map(value => value.nodeId)];
  const replayed = await replayOperation(db, stored, args, hash, persistence, ids);
  if (replayed) return replayed;
  if (!stored || stored.day_key !== args.token.dayKey ||
    (stored.revision !== args.token.revision && (!args.sourceSession?.cycle ||
      args.sourceSession.cycle.stamp !== stored.session.cycle!.stamp)) ||
    (!args.historyMode && stored.day_key !== flowDay(args.now, settings))) throw new Error('daily_flow_changed');
  if (args.navigation) return commitDailyFlowNavigation(db, stored, args, settings, persistence, hash);
  const mode = stored.mode as ReviewSessionMode;
  const invalidated = stored.invalidated || stored.settings_key !== JSON.stringify(settings);
  const base = invalidated
    ? await reconcileCycle(db, stored, args.now, settings, persistence) : stored.session;
  if (invalidated && !args.historyMode && !await isCycleCurrentReady(db, base, mode, args.now, settings, persistence)) {
    await chooseCycleCurrent(db, base, mode, args.now, settings, persistence);
  }
  const sourceSession = { ...base, isAnswerRevealed: args.sourceSession?.isAnswerRevealed ?? base.isAnswerRevealed,
    cycle: { ...base.cycle! } };
  delete sourceSession.cycle.change;
  sourceSession.cycle.stamp = cycleStamp(sourceSession.cycle, sourceSession);
  const snapshot = await scopedDailySnapshot(db, persistence, ids);
  assertCycleLearningFacts(snapshot, args);
  if (args.readingAction && (base.currentNodeId !== args.readings?.[0]?.nodeId ||
    !isReadingReviewItemNode(snapshot.nodesById[base.currentNodeId ?? '']))) throw new Error('daily_flow_learning_changed');
  if (args.grade && (base.currentNodeId !== args.grade.nodeId ||
    !flowPlan(snapshot, 'review-first', args.now, settings).fsrsQueueNodeIds.includes(args.grade.nodeId))) {
    throw new Error('daily_flow_learning_changed');
  }
  const historySession = args.historyMode ? args.historySourceSession?.flowFormat === 'legacy-queue-v1'
    ? await replayLegacyCycle(db, base, args, settings, persistence) : await replayCycleHistory(db, base, args) : null;
  const { learningChanged, ...result } = await persistCycleLearning(db, args, persistence);
  const updated = learningChanged ? await scopedDailySnapshot(db, persistence, ids) : snapshot;
  let session: DailyFlowSession = historySession ?? await advanceCycleFlow(db, sourceSession, args, updated, settings, persistence, mode);
  if (args.reviewHistory?.mode === 'redo') session = { ...session,
    nextReviewDueAt: resolveEarliestReviewDueAt(args.sourceSession?.nextReviewDueAt, result.card?.due) };
  session = await cycleWindow(db, session, { mode, now: args.now, settings, persistence });
  const saved = await saveCycleFlow(db, { dayKey: stored.day_key, mode, settingsKey: JSON.stringify(settings),
    now: args.now, revision: stored.revision + 1, session });
  await db.run('INSERT INTO daily_flow_operations (op_id, input_hash, revision, card_json, source_session_json) VALUES (?, ?, ?, ?, ?)',
    [args.opId, hash, saved.daily!.revision, result.card === undefined ? null : JSON.stringify(result.card), JSON.stringify(sourceSession)]);
  const receipt = await scopedDailySnapshot(db, persistence, [...ids, saved.currentNodeId]);
  return { sourceSession, mutationTimestamp: args.now, nodes: receipt.nodesById, session: saved, ...result,
    ...(args.readings ? { readings: args.readings.map(value => ({ nodeId: value.nodeId,
      reading: updated.nodesById[value.nodeId]?.reading ?? null })) } : {}) };
}

async function replayOperation(db: DbPort, stored: Awaited<ReturnType<typeof readDailyFlow>>,
  args: DailyFlowCommitArgs, hash: string, persistence: DailyFlowPersistence, ids: (string | null | undefined)[]) {
  const [previous] = await db.query<{ input_hash: string; revision: number; card_json: string | null; source_session_json: string | null }>(
    'SELECT input_hash, revision, card_json, source_session_json FROM daily_flow_operations WHERE op_id = ?', [args.opId]);
  if (previous) {
    if (previous.input_hash !== hash) throw new Error('daily_flow_operation_mismatch');
    if (!stored || stored.invalidated || stored.revision !== previous.revision) throw new Error('daily_flow_ack_superseded');
    const snapshot = await scopedDailySnapshot(db, persistence, ids);
    return { ...(previous.source_session_json ? { sourceSession: JSON.parse(previous.source_session_json) as DailyFlowSession } : {}), session: stored.session, nodes: snapshot.nodesById, replayed: true, mutationTimestamp: args.now,
      readings: (args.readings ?? []).map(value => ({ nodeId: value.nodeId, reading: snapshot.nodesById[value.nodeId]?.reading ?? null })),
      ...(previous.card_json === null ? {} : { card: JSON.parse(previous.card_json) }) };
  }
  return null;
}
