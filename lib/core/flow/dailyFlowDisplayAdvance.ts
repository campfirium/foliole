import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import type { DbPort } from '../sync/dbPort.js';

import { cycleReadyNodeIds, selectCycleSuccessor, cycleWindow } from './cycleFlowSelection.js';
import type { DailyFlowSettings, DailyFlowLearningSnapshot } from './dailyFlowContract.js';
import { flowDay } from './dailyFlowPlanning.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { createSqliteDailyFlowStore } from './dailyFlowSqliteStore.js';
import { readDailyFlow } from './dailyFlowStorage.js';

// A display cursor uses the shared selector and committed eligibility, never writes queue rows.
export async function advanceDailyFlowDisplay(db: DbPort, args: {
  session: DailyFlowSession; excluded: readonly string[]; now: string; mode: ReviewSessionMode;
  applied?: readonly { nodeId: string; revision: number }[];
  knownSnapshot?: DailyFlowLearningSnapshot | null;
}, settings: DailyFlowSettings, persistence: DailyFlowPersistence) {
  const source = args.session;
  if (!source.cycle || !source.daily || source.daily.scope !== settings.scope ||
    source.daily.dayKey !== flowDay(args.now, settings)) throw new Error('daily_flow_display_changed');
  const cycle = { ...source.cycle };
  delete cycle.change;
  const stored = await readDailyFlow(db);
  if (!stored || stored.day_key !== source.daily.dayKey) throw new Error('daily_flow_display_changed');
  const excluded = [...args.excluded, ...(args.applied ?? [])
    .filter(value => stored.revision < value.revision).map(value => value.nodeId)];
  const store = createSqliteDailyFlowStore(db, persistence);
  let next = await selectCycleSuccessor(store, cycle, { mode: args.mode, now: args.now, settings, excluded });
  // A borrowed snapshot must not resurrect learning/deletion already known by the catalog.
  while (next && args.knownSnapshot && !cycleReadyNodeIds({ ...args.knownSnapshot, nodeOrder: [next.node_id] },
    args.mode, args.now, settings).includes(next.node_id)) {
    excluded.push(next.node_id);
    next = await selectCycleSuccessor(store, cycle, { mode: args.mode, now: args.now, settings, excluded });
  }
  return { observedRevision: stored.revision, session: cycleWindow({ ...source, cycle, currentNodeId: next?.node_id ?? null,
    currentItemStartedAt: args.now, isAnswerRevealed: false,
    completedAt: next ? null : args.now, continueNodeId: null }) };
}
