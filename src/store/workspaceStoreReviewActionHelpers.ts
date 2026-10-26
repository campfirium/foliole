import { dailyFlowOperationId } from '../../lib/core/flow/dailyFlowRetry';
import type { ReviewGrade, SchedulerCard } from '../features/review/model/reviewTypes';

import { createWorkspaceActionHistoryEntryId } from './workspaceActionHistoryEntry';
import { captureWorkspaceHistoryContext } from './workspaceHistoryContext';
import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import { createReviewGradeHistoryEntry } from './workspaceReviewGradeActionHistory';
import { buildReviewSessionAfterGrade } from './workspaceReviewGradeSession';
import { buildCurrentReviewSessionQueueOutput } from './workspaceReviewLiveQueue';
import {
  runtimeWorkspaceReviewPersistence,
  type WorkspaceReviewPersistenceAdapter
} from './workspaceReviewPersistence';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import type { SequentialReadingChange } from './workspaceSequentialReading';
import type { WorkspaceState } from './workspaceStore';
import {
  createTopicDismissHistoryEntry,
  type WorkspaceTopicReadingActionTitle
} from './workspaceTopicDismissActionHistory';

export async function persistReviewGradeMutation(args: {
  opId?: string;
  currentNodeId: string;
  grade: ReviewGrade;
  reviewedAt: string;
  schedulerVersion: string;
  cardBefore: SchedulerCard;
  cardAfter: SchedulerCard;
}, persistence: WorkspaceReviewPersistenceAdapter = runtimeWorkspaceReviewPersistence) {
  return persistence.persistReviewGrade(args);
}

export function buildGradedReviewState(args: {
  snapshot: WorkspaceState;
  currentNodeId: string;
  nodePatch: { review: import('../features/nodes/model/nodeTypes').NodeReviewProfile | null };
  now: string;
  persistedSession?: WorkspaceState['reviewSession'];
}) {
  const state = args.snapshot;
  const node = state.nodesById[args.currentNodeId];
  if (!node) return null;
  const nextNodesById = {
    ...state.nodesById,
    [args.currentNodeId]: {
      ...node,
      ...args.nodePatch
    }
  };
  const nextQueue = args.persistedSession ? { currentNodeId: args.persistedSession.currentNodeId,
    taskNodeIds: args.persistedSession.queueNodeIds, extensionNodeIds: [args.persistedSession.continueNodeId].filter((id): id is string => Boolean(id)) }
    : buildCurrentReviewSessionQueueOutput(state, args.now, {
    nodesById: nextNodesById,
    releaseCurrentPin: true
  });
  const nextNodeId = nextQueue.currentNodeId;
  const reviewElapsedMsDelta = calculateReviewStepElapsedMs(args.snapshot.reviewSession, args.now);
  const reviewedItemDelta = nextQueue.taskNodeIds.includes(args.currentNodeId) ? 0 : 1;
  const continueNodeId = nextQueue.extensionNodeIds[0] ?? null;
  const nextReviewSession = args.persistedSession ?? buildReviewSessionAfterGrade({
    continueNodeId,
    nextDueAt: args.nodePatch.review?.due ?? null,
    nextNodeId,
    now: args.now,
    queueNodeIds: nextQueue.taskNodeIds,
    reviewElapsedMsDelta,
    reviewSession: args.snapshot.reviewSession,
    reviewedItemDelta
  });
  const activeContext = buildReviewActiveNodeContext(state, nextNodeId ?? continueNodeId);
  return {
    historyEntry: createReviewGradeHistoryEntry({
      afterContext: captureWorkspaceHistoryContext(state, {
        ...activeContext,
        reviewSession: nextReviewSession
      }),
      afterReview: args.nodePatch.review,
      beforeContext: captureWorkspaceHistoryContext(state),
      beforeReview: node.review ?? null,
      id: createWorkspaceActionHistoryEntryId(),
      mutationTimestamp: args.now,
      nodeId: args.currentNodeId
    }),
    patch: {
      ...activeContext,
      nodesById: nextNodesById,
      reviewSession: nextReviewSession
    }
  };
}

export function createReadingReviewHistoryEntry(args: {
  afterActiveNodeId: string | null;
  afterBrowseRootNodeId?: string;
  afterReading: WorkspaceState['nodesById'][string]['reading'] | null | undefined;
  afterReviewSession: WorkspaceState['reviewSession'];
  beforeReading: WorkspaceState['nodesById'][string]['reading'] | null | undefined;
  beforeReviewSession: WorkspaceState['reviewSession'];
  mutationTimestamp: string;
  nodeId: string;
  relatedReadings?: SequentialReadingChange[];
  state: WorkspaceState;
  title: WorkspaceTopicReadingActionTitle;
}) {
  return createTopicDismissHistoryEntry({
    afterContext: captureWorkspaceHistoryContext(args.state, {
      activeNodeId: args.afterActiveNodeId,
      ...(args.afterBrowseRootNodeId ? { browseRootNodeId: args.afterBrowseRootNodeId } : {}),
      reviewSession: args.afterReviewSession
    }),
    afterReading: args.afterReading,
    beforeContext: captureWorkspaceHistoryContext(args.state, {
      reviewSession: args.beforeReviewSession
    }),
    beforeReading: args.beforeReading,
    id: args.beforeReviewSession.daily && args.title !== 'Postpone Topic'
      ? dailyFlowOperationId(args.beforeReviewSession.daily, args.nodeId, args.title) : createWorkspaceActionHistoryEntryId(),
    mutationTimestamp: args.mutationTimestamp,
    nodeId: args.nodeId,
    ...(args.relatedReadings ? { relatedReadings: args.relatedReadings } : {}),
    title: args.title
  });
}
