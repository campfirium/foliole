import { isFsrsReviewItemNode } from '../review/reviewItemKind.js';

import type { CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowLearningSnapshot, DailyFlowOpenArgs, DailyFlowSettings } from './dailyFlowContract.js';
import { dailyFlowMembershipHash } from './dailyFlowMembership.js';
import { flowDay, prepareDailyFlowPlans, prepareFlowSession } from './dailyFlowPlanning.js';

export function buildCycle(snapshot: DailyFlowLearningSnapshot, args: DailyFlowOpenArgs, settings: DailyFlowSettings,
  plans = prepareDailyFlowPlans(snapshot, args, settings)) {
  const seed = args.seed?.sessionStartedAt && flowDay(args.seed.sessionStartedAt, settings) === flowDay(args.now, settings)
    ? args.seed : undefined;

  args = { ...args, mode: plans.mode };
  const initial = prepareFlowSession(snapshot, args, settings, seed, plans.initial);
  const queue = initial.queueNodeIds;
  const queued = new Set(queue);
  const pinned = initial.currentNodeId && !queue.includes(initial.currentNodeId) ? [initial.currentNodeId] : [];
  const soon = [...new Set([...(initial.hiddenSoonNodeIds ?? []), ...(initial.soonNodeIds ?? [])])];
  const ids = [...new Set(seed ? [...queue, ...pinned, ...soon, ...plans.fullDayNodeIds]
    : [...(initial.currentNodeId ? [initial.currentNodeId] : []), ...plans.fullDayNodeIds])];
  const pendingSoon = new Set(soon);
  const rows: CycleRow[] = ids.map((node_id, index) => ({ node_id, order_key: index + 1, active: 1,
    handled: 0, cohort: queued.has(node_id) ? 'queue' : pendingSoon.has(node_id) ? 'soon' : 'none', initial_task: queued.has(node_id) ? 1 : 0 }));
  const clearKey = rows.reduce((last, row) => row.initial_task ? row.order_key : last, 0);
  const cycle = { clearKey, clearedAt: null, scanAfter: 0, lapLimit: rows.length, tailKey: rows.length,
    remaining: queue.length,
    reviewRemaining: queue.filter(id => isFsrsReviewItemNode(snapshot.nodesById[id])).length };
  const session = { ...initial, candidateMembershipHash: dailyFlowMembershipHash(plans.fullDayNodeIds), flowFormat: 'cycle-v1' as const, cycle };
  return { session, snapshot, rows, mode: plans.mode };
}
