
import { reconcileCycle } from './cycleFlowOpen.js';
import { cycleWindow } from './cycleFlowSelection.js';
import type { DailyFlowCommitArgs, DailyFlowSettings } from './dailyFlowContract.js';
import { flowPlan } from './dailyFlowPlanning.js';
import { currentFlowLearning } from './dailyFlowReceipt.js';
import type { DailyFlowStore } from './dailyFlowStore.js';
import type { CycleStored } from './dailyFlowStore.js';

export async function commitDailyFlowNavigation(db: DailyFlowStore, stored: CycleStored, args: DailyFlowCommitArgs,
  settings: DailyFlowSettings, hash: string) {
  const source = stored.session;
  if (source.currentNodeId || source.continueNodeId !== args.expectedContinueNodeId ||
    !(source.reviewedItemCount! > 0) || stored.mode === 'review-first') throw new Error('daily_flow_changed');
  const target = args.expectedContinueNodeId!;
  const base = stored.invalidated ? await reconcileCycle(db, stored, args.now, settings)
    : { ...source, cycle: { ...source.cycle! } };
  const snapshot = await db.scopedLearningSnapshot([target]);
  const [row] = await db.readRows([target]);
  const ready = row?.active && flowPlan(snapshot, 'reading-only', args.now, settings).readingQueueNodeIds.includes(target);
  const session = { ...base, currentNodeId: ready ? target : null, continueNodeId: null,
    ...(ready ? { completedAt: null, currentItemStartedAt: args.now, isAnswerRevealed: false,
      cycle: { ...base.cycle!, scanAfter: row.order_key } } : {}) };
  const window = cycleWindow(session);
  const saved = await db.saveState({ dayKey: stored.day_key, mode: stored.mode,
    settingsKey: JSON.stringify(settings), now: args.now, revision: stored.revision + 1, session: window });
  await db.saveOperation(args.opId, { input_hash: hash, revision: saved.daily!.revision,
    card_json: null, source_session_json: JSON.stringify(source) });
  return { sourceSession: source, session: saved, mutationTimestamp: args.now, learning: currentFlowLearning(snapshot, saved.currentNodeId) };
}
