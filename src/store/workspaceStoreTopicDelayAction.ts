import { resolveTopicPostponeDelayNextAt } from '../../lib/core/review/topicPostponeDelay';
import type { Node, NodeReadingProfile } from '../features/nodes/model/nodeTypes';
import { buildReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { readWorkspaceOperationLearning } from '../shared/platform/runtime/workspaceOperationLearning';

import { isSameReadingProfile } from './workspaceActionHistoryReading';
import { persistAndApplyReadingReviewPatch, type ReadingReviewPatchResult, type ReadingReviewPendingNodeIds } from './workspaceReadingReviewHistoryCommit';
import { runtimeWorkspaceReviewPersistence, type WorkspaceReviewPersistenceAdapter } from './workspaceReviewPersistence';
import { resolveReadingPriorityChain } from './workspaceReviewReading';
import type { WorkspaceState } from './workspaceStore';
import { persistNodeOpened } from './workspaceStoreNodeOpenState';
import { createReadingReviewHistoryEntry } from './workspaceStoreReviewActionHelpers';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;

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

function buildTopicDelayPatch(args: {
  level: number;
  nodeId: string;
  now: string;
  snapshot: WorkspaceState;
  state: WorkspaceState;
}): ReadingReviewPatchResult | null {
  const node = args.state.nodesById[args.nodeId];
  if (args.state.trashedNodeIds.includes(args.nodeId) || !canDelayTopic(node)) return null;
  const baseReading = node.reading ?? buildInitialReadingProfile({ node, nodeId: args.nodeId, now: args.now, state: args.state });
  const nextAt = resolveTopicPostponeDelayNextAt({ level: args.level, now: args.now, reading: baseReading });
  const nextReading = { ...baseReading, nextAt, state: 'active' as const };
  const nextNode = { ...node, reading: nextReading };
  const nextNodesById = { ...args.state.nodesById, [args.nodeId]: nextNode };
  const reviewSession = args.state.reviewSession;
  const afterActiveNodeId = reviewSession.currentNodeId ?? reviewSession.continueNodeId ?? args.state.activeNodeId;
  return {
    historyEntry: createReadingReviewHistoryEntry({
      afterActiveNodeId,
      afterReading: nextReading,
      afterReviewSession: reviewSession,
      beforeReading: node.reading,
      beforeReviewSession: args.snapshot.reviewSession,
      mutationTimestamp: args.now,
      nodeId: args.nodeId,
      state: args.state,
      title: 'Postpone Topic'
    }),
    nextNodesForSync: [nextNode],
    patch: {
      activeNodeId: afterActiveNodeId,
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
  return async (nodeId, level, now = new Date().toISOString(), expectedReading) => {
    const snapshot = get();
    if (!canDelayTopic(snapshot.nodesById[nodeId]) || pendingNodeIds.has(nodeId)) return false;
    const committed = await persistAndApplyReadingReviewPatch({ currentNodeId: nodeId, get, set, pendingNodeIds, persistence,
      buildPatch: async state => {
        const nodesById = await readWorkspaceOperationLearning(state.nodesById, [nodeId],
          state.libraryScope ?? state.reviewSession.daily?.scope);
        if (!nodesById || (expectedReading !== undefined && !isSameReadingProfile(nodesById[nodeId]?.reading, expectedReading))) return null;
        return buildTopicDelayPatch({ level, nodeId, now, snapshot, state: { ...state, nodesById } });
      } });
    if (committed && committed.nextActiveNodeId) void persistNodeOpened(set, committed.nextActiveNodeId, now);
    return Boolean(committed);
  };
}
