import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import type { DbPort } from '../sync/dbPort.js';

import { reconcileCycle } from './cycleFlowOpen.js';
import { cycleWindow } from './cycleFlowSelection.js';
import type { DailyFlowCommitArgs, DailyFlowSettings } from './dailyFlowContract.js';
import { scopedDailyLearningSnapshot } from './dailyFlowGrade.js';
import { flowPlan } from './dailyFlowPlanning.js';
import { currentFlowLearning } from './dailyFlowReceipt.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import { readCycleRows, saveCycleFlow, type CycleStored } from './dailyFlowStorage.js';

export async function commitDailyFlowNavigation(db: DbPort, stored: CycleStored, args: DailyFlowCommitArgs,
  settings: DailyFlowSettings, persistence: DailyFlowPersistence, hash: string) {
  const source = stored.session;
  if (source.currentNodeId || source.continueNodeId !== args.expectedContinueNodeId ||
    !(source.reviewedItemCount! > 0) || stored.mode === 'review-first') throw new Error('daily_flow_changed');
  const target = args.expectedContinueNodeId!;
  const base = stored.invalidated ? await reconcileCycle(db, stored, args.now, settings, persistence)
    : { ...source, cycle: { ...source.cycle! } };
  const snapshot = await scopedDailyLearningSnapshot(db, persistence, [target]);
  const [row] = await readCycleRows(db, [target]);
  const ready = row?.active && flowPlan(snapshot, 'reading-only', args.now, settings).readingQueueNodeIds.includes(target);
  const session = { ...base, currentNodeId: ready ? target : null, continueNodeId: null,
    ...(ready ? { completedAt: null, currentItemStartedAt: args.now, isAnswerRevealed: false,
      cycle: { ...base.cycle!, scanAfter: row.order_key } } : {}) };
  const window = await cycleWindow(db, session, { mode: stored.mode as ReviewSessionMode, now: args.now, settings, persistence });
  const saved = await saveCycleFlow(db, { dayKey: stored.day_key, mode: stored.mode,
    settingsKey: JSON.stringify(settings), now: args.now, revision: stored.revision + 1, session: window });
  await db.run('INSERT INTO daily_flow_operations (op_id, input_hash, revision, card_json) VALUES (?, ?, ?, NULL)',
    [args.opId, hash, saved.daily!.revision]);
  return { session: saved, mutationTimestamp: args.now, learning: currentFlowLearning(snapshot, saved.currentNodeId) };
}
