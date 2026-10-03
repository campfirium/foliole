import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import { isFsrsReviewItemNode, isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { isCanonicalVisibleNodeId } from '../shared/workspaceCanonicalSelectors';

import { buildNextDismissReviewSession } from './workspaceReviewDismissSession';
import { buildReviewSessionAfterGrade } from './workspaceReviewGradeSession';
import { buildCurrentReviewSessionQueueOutput, buildLiveReviewQueue, buildStartReviewSessionQueue } from './workspaceReviewLiveQueue';
import { createEmptyReviewSession, createStartedReviewSession } from './workspaceReviewReading';
import { buildResumeReviewSessionQueue } from './workspaceReviewResumeQueue';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import type { ReviewSessionState } from './workspaceStore';
import { advanceAfterSoonAction, advanceOrCompleteAfterReadingAction, type ReviewFlowState } from './workspaceStoreReadingReviewSessionFlow';

export type FlowAction = 'read' | 'later' | 'dismiss' | 'soon' | 'grade';

export function flowState(snapshot: WorkspaceSnapshot, reviewSession: ReviewSessionState,
  reviewSessionMode: ReviewSessionMode): ReviewFlowState {
  const normalized = normalizeWorkspaceSnapshot(snapshot);
  return { ...normalized, nodesById: normalized.nodesById as ReviewFlowState['nodesById'],
    reviewSession, reviewSessionMode };
}

export function resumeFlowSession(snapshot: WorkspaceSnapshot, mode: ReviewSessionMode,
  preferredNodeId: string | null, now: string): ReviewSessionState {
  const state = flowState(snapshot, createEmptyReviewSession(), mode);
  state.reviewSession.queueNodeIds = buildStartReviewSessionQueue(state, now);
  const queueNodeIds = buildResumeReviewSessionQueue(state, now, { preferredNodeId });
  return queueNodeIds.length ? createStartedReviewSession({
    continueNodeId: preferredNodeId, currentNodeId: queueNodeIds[0]!, queueNodeIds,
    sessionStartedAt: now, totalNodeCount: queueNodeIds.length
  }) : createEmptyReviewSession();
}

export function reconcileFlowSession(snapshot: WorkspaceSnapshot, session: ReviewSessionState,
  mode: ReviewSessionMode, refreshedAt?: string) {
  const isAvailable = (id: string) => isCanonicalVisibleNodeId(snapshot, id) &&
    (isFsrsReviewItemNode(snapshot.nodesById[id]) ||
      (mode !== 'review-first' && isReadingReviewItemNode(snapshot.nodesById[id])));
  const queueNodeIds = session.queueNodeIds.filter(isAvailable);
  const soonNodeIds = (session.soonNodeIds ?? []).filter(isAvailable);
  let addedNodeCount = 0;
  if (mode === 'review-first' && refreshedAt) {
    const seen = new Set([session.currentNodeId, ...queueNodeIds, ...soonNodeIds]);
    const fresh = buildLiveReviewQueue(flowState(snapshot, session, mode), refreshedAt)
      .filter((id) => !seen.has(id));
    if (fresh.length && !session.currentNodeId && !queueNodeIds.length && !soonNodeIds.length) {
      return createStartedReviewSession({ continueNodeId: null, currentNodeId: fresh[0]!,
        queueNodeIds: fresh, sessionStartedAt: refreshedAt, totalNodeCount: fresh.length });
    }
    queueNodeIds.push(...fresh);
    addedNodeCount = fresh.length;
  }
  const currentNodeId = session.currentNodeId && isAvailable(session.currentNodeId)
    ? session.currentNodeId : queueNodeIds[0] ?? soonNodeIds.shift() ?? null;
  return { ...session, currentNodeId, queueNodeIds, soonNodeIds,
    totalNodeCount: session.totalNodeCount + addedNodeCount,
    isAnswerRevealed: currentNodeId === session.currentNodeId && session.isAnswerRevealed };
}

export function advanceFlowSession(args: {
  action: FlowAction; snapshot: WorkspaceSnapshot; session: ReviewSessionState;
  mode: ReviewSessionMode; now: string;
}) {
  const currentNodeId = args.session.currentNodeId;
  if (!currentNodeId) return args.session;
  const state = flowState(args.snapshot, args.session, args.mode);
  const common = { currentNodeId, now: args.now, snapshot: state, state };
  const readingElapsedMsDelta = calculateReviewStepElapsedMs(args.session, args.now);
  const progressDelta = args.session.queueNodeIds.includes(currentNodeId) ? 1 : 0;
  if (args.action === 'soon') return advanceAfterSoonAction({ ...common, progressDelta, readingElapsedMsDelta });
  if (args.action === 'dismiss') return buildNextDismissReviewSession({
    ...common, nextNodesById: state.nodesById
  }).nextReviewSession;
  if (args.action !== 'grade') return advanceOrCompleteAfterReadingAction({
    ...common, nextNodesById: state.nodesById, progressDelta, readingElapsedMsDelta
  });
  const next = buildCurrentReviewSessionQueueOutput(state, args.now, { releaseCurrentPin: true });
  return buildReviewSessionAfterGrade({
    continueNodeId: next.extensionNodeIds[0] ?? null,
    nextDueAt: state.nodesById[currentNodeId]?.review?.due ?? args.now,
    nextNodeId: next.currentNodeId, now: args.now, queueNodeIds: next.taskNodeIds,
    reviewElapsedMsDelta: readingElapsedMsDelta, reviewSession: args.session,
    reviewedItemDelta: next.taskNodeIds.includes(currentNodeId) ? 0 : 1
  });
}
