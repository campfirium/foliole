import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { reviewCalendarDayKey } from '../../lib/core/review/reviewCalendarDates';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { advanceFlowSession, type FlowAction } from '../store/workspaceFlowSession';
import { cloneWorkspaceReviewSession } from '../store/workspaceHistoryContext';
import { createReviewGradeHistoryEntry } from '../store/workspaceReviewGradeActionHistory';
import type { ReviewSessionState } from '../store/workspaceStoreTypes';
import { createTopicDismissHistoryEntry, type WorkspaceTopicReadingActionTitle } from '../store/workspaceTopicDismissActionHistory';

export interface CompanionFlowHistoryContext {
  key: string;
  mode: ReviewSessionMode;
  session: ReviewSessionState;
}

export function createCompanionFlowHistoryEntry(args: {
  action: FlowAction; nodeId: string; now: string; before: WorkspaceSnapshot;
  after: WorkspaceSnapshot; history: CompanionFlowHistoryContext; relatedNodeIds?: string[];
}) {
  const beforeSession = cloneWorkspaceReviewSession(args.history.session);
  const afterSession = advanceFlowSession({ action: args.action, snapshot: args.after,
    session: beforeSession, mode: args.history.mode, now: args.now });
  const context = (session: ReviewSessionState) => ({ activeNodeId: session.currentNodeId,
    browseRootNodeId: '', reviewSession: session });
  const common = { id: crypto.randomUUID(), mutationTimestamp: args.now, nodeId: args.nodeId,
    beforeContext: context(beforeSession), afterContext: context(afterSession) };
  const before = args.before.nodesById[args.nodeId];
  const after = args.after.nodesById[args.nodeId];
  if (!before || !after) throw new Error('The current item is no longer available.');
  if (args.action === 'grade') {
    if (!after.review) throw new Error('The review grade is unavailable.');
    return createReviewGradeHistoryEntry({ ...common, beforeReview: before.review, afterReview: after.review });
  }
  const titles: Record<Exclude<FlowAction, 'grade'>, WorkspaceTopicReadingActionTitle> = {
    read: 'Read Topic', later: 'Later Topic', dismiss: 'Dismiss Topic', soon: 'Soon Topic'
  };
  return createTopicDismissHistoryEntry({ ...common, title: titles[args.action],
    beforeReading: before.reading, afterReading: after.reading,
    relatedReadings: (args.relatedNodeIds ?? []).filter(id => id !== args.nodeId).map(nodeId => ({ nodeId,
      beforeReading: args.before.nodesById[nodeId]?.reading, afterReading: args.after.nodesById[nodeId]?.reading })) });
}

export function completedFlowReviewDay(snapshot: WorkspaceSnapshot, nodeId: string) {
  return reviewCalendarDayKey(new Date(snapshot.nodesById[nodeId]!.reading!.lastHandledAt),
    getCurrentReviewSchedulerSettings().newDayStartsAtHour);
}
