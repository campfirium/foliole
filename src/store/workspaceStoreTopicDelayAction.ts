import { resolveTopicPostponeDelayNextAt } from '../../lib/core/review/topicPostponeDelay';
import type { Node, NodeReadingProfile } from '../features/nodes/model/nodeTypes';
import { buildReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import {
  runtimeWorkspaceReviewPersistence,
  type WorkspaceReviewPersistenceAdapter
} from './workspaceReviewPersistence';
import { resolveReadingPriorityChain } from './workspaceReviewReading';
import type { WorkspaceState } from './workspaceStore';
import { persistNodeOpened } from './workspaceStoreNodeOpenState';
import type { ReadingReviewPendingNodeIds } from './workspaceStoreReadingReviewActions';
import { advanceOrCompleteAfterReadingAction } from './workspaceStoreReadingReviewSessionFlow';
import { createReadingReviewHistoryPatch } from './workspaceStoreReviewActionHelpers';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;

interface TopicDelayPatchResult {
  nextNode: Node;
  patch: Partial<WorkspaceState>;
}

function parseTime(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function canDelayTopic(node: Node | undefined): node is Node {
  return Boolean(node && node.kind === 'topic' && node.reading?.state !== 'dismissed');
}

function buildInitialReadingProfile(args: {
  node: Node;
  nodeId: string;
  now: string;
  state: WorkspaceState;
}): NodeReadingProfile {
  const pushQueueSettings = getCurrentReviewSchedulerSettings().pushQueue;
  const intervalDurationMs = pushQueueSettings.readingInitialIntervalMs;
  const schedule = buildReadingScheduleCoreFields({
    intervalDurationMs,
    lastHandledAt: new Date(parseTime(args.now) - intervalDurationMs).toISOString(),
    priorityChain: resolveReadingPriorityChain({
      currentNodeId: args.nodeId,
      currentReading: args.node.reading,
      defaultPriority: pushQueueSettings.defaultPriority,
      nodesById: args.state.nodesById
    }),
    range: pushQueueSettings.readingIntervalGrowthFactorRange,
    repetitionCount: 0
  });
  return { ...schedule, readingPosition: 0, state: 'active' };
}

function buildReviewSessionAfterDelay(args: {
  nodeId: string;
  nextNodesById: WorkspaceState['nodesById'];
  now: string;
  snapshot: WorkspaceState;
  state: WorkspaceState;
}) {
  if (args.snapshot.reviewSession.currentNodeId !== args.nodeId) {
    return args.state.reviewSession;
  }
  return advanceOrCompleteAfterReadingAction({
    currentNodeId: args.nodeId,
    nextNodesById: args.nextNodesById,
    now: args.now,
    progressDelta: 0,
    readingElapsedMsDelta: 0,
    snapshot: args.snapshot,
    state: args.state
  });
}

function buildTopicDelayPatch(args: {
  level: number;
  nodeId: string;
  now: string;
  snapshot: WorkspaceState;
  state: WorkspaceState;
}): TopicDelayPatchResult | null {
  const node = args.state.nodesById[args.nodeId];
  if (args.state.trashedNodeIds.includes(args.nodeId) || !canDelayTopic(node)) return null;
  const baseReading = node.reading ?? buildInitialReadingProfile({ node, nodeId: args.nodeId, now: args.now, state: args.state });
  const nextAt = resolveTopicPostponeDelayNextAt({ level: args.level, now: args.now, reading: baseReading });
  const nextReading = { ...baseReading, nextAt, state: 'active' as const };
  const nextNode = { ...node, reading: nextReading };
  const nextNodesById = { ...args.state.nodesById, [args.nodeId]: nextNode };
  const reviewSession = buildReviewSessionAfterDelay({ ...args, nextNodesById });
  return {
    nextNode,
    patch: {
      activeNodeId: reviewSession.currentNodeId ?? reviewSession.continueNodeId ?? args.state.activeNodeId,
      ...createReadingReviewHistoryPatch({
        afterReading: nextReading,
        afterReviewSession: reviewSession,
        beforeReading: node.reading,
        beforeReviewSession: args.snapshot.reviewSession,
        nodeId: args.nodeId,
        state: args.state,
        title: 'Postpone Topic'
      }),
      nodesById: nextNodesById,
      reviewSession
    }
  };
}

export function createSetReviewTopicDelayActionWithPending(
  set: WorkspaceSet,
  get: WorkspaceGet,
  pendingNodeIds: ReadingReviewPendingNodeIds,
  persistence: WorkspaceReviewPersistenceAdapter = runtimeWorkspaceReviewPersistence
): WorkspaceState['setReviewTopicDelay'] {
  return async (nodeId, level, now = new Date().toISOString()) => {
    const snapshot = get();
    const node = snapshot.nodesById[nodeId];
    if (!canDelayTopic(node) || pendingNodeIds.has(nodeId)) return false;
    pendingNodeIds.add(nodeId);
    try {
      const result = buildTopicDelayPatch({ level, nodeId, now, snapshot, state: get() });
      if (!result || !(await persistence.persistReadingNodes([result.nextNode]))) return false;
      set((state) => {
        const currentNode = state.nodesById[nodeId];
        if (!canDelayTopic(currentNode)) return state;
        return result.patch;
      });
      const nextActiveNodeId = result.patch.reviewSession?.currentNodeId ?? result.patch.reviewSession?.continueNodeId;
      if (nextActiveNodeId) void persistNodeOpened(set, nextActiveNodeId, now);
      return true;
    } finally {
      pendingNodeIds.delete(nodeId);
    }
  };
}
