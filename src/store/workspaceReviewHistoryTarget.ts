import type { NodeReadingProfile, NodeReviewProfile } from '../features/nodes/model/nodeTypes';

import { isSameReadingProfile } from './workspaceActionHistoryReading';
import { hasTargetedDailyFlow } from './workspaceDailyFlowMutations';
import { isSameWorkspaceReviewSession, type WorkspaceHistoryContext } from './workspaceHistoryContext';
import { isSameReviewProfile, type WorkspaceReviewGradeHistoryEntry } from './workspaceReviewGradeActionHistory';
import { resolveTopicReadingHistoryApply, type WorkspaceTopicDismissHistoryEntry } from './workspaceTopicDismissActionHistory';

export type FlowHistoryEntry = WorkspaceReviewGradeHistoryEntry | WorkspaceTopicDismissHistoryEntry;
export type HistoryMode = 'undo' | 'redo';
type HistoryNode = { reading?: NodeReadingProfile | null; review?: NodeReviewProfile | null };

export function resolveWorkspaceReviewHistoryTarget<N extends HistoryNode>(args: {
  entry: FlowHistoryEntry;
  mode: HistoryMode;
  nodesById: Record<string, N>;
  trashedNodeIds: string[];
  reviewSession: WorkspaceHistoryContext['reviewSession'];
}) {
  const { entry, mode } = args;
  const source = mode === 'undo' ? entry.afterContext : entry.beforeContext;
  const session = entry.type === 'review.grade'
    ? { ...args.reviewSession, nextReviewDueAt: null } : args.reviewSession;
  const expectedSession = entry.type === 'review.grade'
    ? { ...source.reviewSession, nextReviewDueAt: null } : source.reviewSession;
  const targeted = Boolean(hasTargetedDailyFlow(args.reviewSession) && expectedSession.flowFormat === 'cycle-v1');
  if (!targeted && !isSameWorkspaceReviewSession(session, expectedSession)) return null;
  const node = args.nodesById[entry.nodeId];
  if (!node || args.trashedNodeIds.includes(entry.nodeId)) return null;
  const nodesById = { ...args.nodesById };
  const context = mode === 'undo' ? entry.beforeContext : entry.afterContext;
  if (entry.type === 'review.grade') {
    const expected = mode === 'undo' ? entry.afterReview : entry.beforeReview;
    if (!targeted && !isSameReviewProfile(node.review, expected)) return null;
    const review = mode === 'undo' ? entry.beforeReview : entry.afterReview;
    if (!targeted) nodesById[entry.nodeId] = { ...node, review: review ? { ...review } : null };
  } else {
    const target = resolveTopicReadingHistoryApply(entry, mode);
    const readings = [{ nodeId: entry.nodeId, ...target }, ...target.relatedReadings];
    for (const reading of readings) {
      const current = nodesById[reading.nodeId];
      if (!current || args.trashedNodeIds.includes(reading.nodeId) ||
        !isSameReadingProfile(current.reading, reading.expectedReading)) return null;
      nodesById[reading.nodeId] = { ...current, reading: reading.nextReading ? { ...reading.nextReading } : null };
    }
  }
  return { context, nodesById };
}
