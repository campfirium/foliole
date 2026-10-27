import type { DailyFlowStore } from '../../../../lib/core/flow/dailyFlowStore';

import { emptyBrowserDailyFlow } from './browserDailyFlowState';
import type { BrowserFlowWorkspace } from './browserDailyFlowStore';
import { appendBrowserReviewHistory, browserReviewProfile, projectBrowserReview } from './browserReviewProjection';

export function browserDailyFlowFacts(get: () => BrowserFlowWorkspace,
  set: (patch: Partial<BrowserFlowWorkspace>) => void): Pick<DailyFlowStore, 'grade' | 'reading' | 'reviewHistory'> {
  const updateNode = (id: string, patch: Partial<BrowserFlowWorkspace['nodesById'][string]>) => {
    const state = get();
    const node = state.nodesById[id];
    if (!node) throw new Error('daily_flow_learning_changed');
    set({ nodesById: { ...state.nodesById, [id]: { ...node, ...patch } } });
  };
  return {
    async grade(args, opId) {
      const before = get().browserDailyFlow ?? emptyBrowserDailyFlow();
      const flow = { ...before, reviewEvents: { ...before.reviewEvents,
        [opId]: { nodeId: args.nodeId, schedulerVersion: args.schedulerVersion, event: { op_id: opId, reviewed_at: args.reviewedAt, kind: 'review' as const,
          grade: args.grade, voids_op_id: null } } } };
      const card = projectBrowserReview(get(), flow, args.nodeId);
      updateNode(args.nodeId, { review: browserReviewProfile(card), updatedAt: args.reviewedAt });
      set({ browserDailyFlow: flow });
      return card;
    },
    async reading(value, now) {
      updateNode(value.nodeId, { reading: value.after, updatedAt: now });
      const flow = get().browserDailyFlow ?? emptyBrowserDailyFlow();
      if (value.completedReviewDay) set({ browserDailyFlow: { ...flow, readingDays: { ...flow.readingDays,
        [value.nodeId]: [...new Set([...(flow.readingDays[value.nodeId] ?? []), value.completedReviewDay])] } } });
    },
    async reviewHistory(value, now) {
      const flow = appendBrowserReviewHistory(get().browserDailyFlow ?? emptyBrowserDailyFlow(), value, now);
      const card = projectBrowserReview(get(), flow, value.nodeId);
      updateNode(value.nodeId, { review: browserReviewProfile(card), updatedAt: now });
      set({ browserDailyFlow: flow });
      return card;
    }
  };
}
