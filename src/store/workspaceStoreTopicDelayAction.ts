import { resolveTopicPostponeDelayNextAt } from '../../lib/core/review/topicPostponeDelay';
import type { Node, NodeReadingProfile } from '../features/nodes/model/nodeTypes';
import { buildReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import {
  beginWorkspaceAction,
  createEmptyWorkspaceActionHistory,
  failWorkspaceAction,
  settleWorkspaceAction
} from './workspaceActionHistory';
import { isSameReadingProfile } from './workspaceActionHistoryReading';
import { hasPersistentDailyFlow, saveDailyReading } from './workspaceDailyFlowMutations';
import { mergeDailyFlowReceiptNodes } from './workspaceDailyFlowReceipt';
import { acceptWorkspaceHistoryCommand } from './workspaceHistoryCommandAcceptance';
import { isSameWorkspaceReviewSession } from './workspaceHistoryContext';
import type { ReadingReviewPendingNodeIds } from './workspaceReadingReviewHistoryCommit';
import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import {
  runtimeWorkspaceReviewPersistence,
  type WorkspaceReviewPersistenceAdapter
} from './workspaceReviewPersistence';
import { resolveReadingPriorityChain } from './workspaceReviewReading';
import type { WorkspaceState } from './workspaceStore';
import { persistNodeOpened } from './workspaceStoreNodeOpenState';
import { createReadingReviewHistoryEntry } from './workspaceStoreReviewActionHelpers';
import type { WorkspaceTopicDismissHistoryEntry } from './workspaceTopicDismissActionHistory';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;

interface TopicDelayPatchResult {
  historyEntry: WorkspaceTopicDismissHistoryEntry;
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
    nextNode,
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
  return async (nodeId, level, now = new Date().toISOString()) => {
    const snapshot = get();
    const node = snapshot.nodesById[nodeId];
    if (!canDelayTopic(node) || pendingNodeIds.has(nodeId)) return false;
    pendingNodeIds.add(nodeId);
    try {
      const result = buildTopicDelayPatch({ level, nodeId, now, snapshot, state: get() });
      if (!result) return false;
      let began = false;
      acceptWorkspaceHistoryCommand(set, 'preserve', (state) => {
        if (state.appActionHistory.applying || state.appActionHistory.pendingAction ||
            state.appActionHistory.pendingCreate) return state;
        began = true;
        return { appActionHistory: beginWorkspaceAction(state.appActionHistory, result.historyEntry) };
      });
      if (!began) return false;
      let persisted = false;
      try {
        persisted = await persistTopicDelay(snapshot, result, now, persistence);
      } catch {
        persisted = false;
      }
      if (!persisted) {
        set((state) => ({
          appActionHistory: failWorkspaceAction(state.appActionHistory, result.historyEntry.id)
        }));
        return false;
      }
      let applied = false;
      let undoRequested = false;
      set((state) => {
        const currentNode = state.nodesById[nodeId];
        const applicable = canDelayTopic(currentNode) &&
          state.appActionHistory.pendingAction?.entry.id === result.historyEntry.id &&
          isSameReadingProfile(currentNode.reading, result.historyEntry.beforeReading) &&
          isSameWorkspaceReviewSession(state.reviewSession, result.historyEntry.beforeContext.reviewSession);
        if (!applicable) return { appActionHistory: createEmptyWorkspaceActionHistory() };
        const settled = settleWorkspaceAction(state.appActionHistory, result.historyEntry.id);
        applied = true;
        undoRequested = settled.undoRequested;
        return { ...result.patch, appActionHistory: settled.history };
      });
      if (!applied) return false;
      if (undoRequested) get().undoWorkspaceAction(result.historyEntry.id);
      const nextActiveNodeId = result.patch.reviewSession?.currentNodeId ?? result.patch.reviewSession?.continueNodeId;
      if (nextActiveNodeId) void persistNodeOpened(set, nextActiveNodeId, now);
      return true;
    } finally {
      pendingNodeIds.delete(nodeId);
    }
  };
}

async function persistTopicDelay(snapshot: WorkspaceState, result: TopicDelayPatchResult, now: string,
  persistence: WorkspaceReviewPersistenceAdapter) {
  if (!hasPersistentDailyFlow(snapshot.reviewSession)) return persistence.persistReadingNodes([result.nextNode], now);
  const saved = await saveDailyReading(snapshot.reviewSession, result.historyEntry, now, result.patch.reviewSession!, undefined, snapshot.nodesById);
  result.patch.nodesById = mergeDailyFlowReceiptNodes(result.patch.nodesById ?? snapshot.nodesById, snapshot.nodesById, saved.nodes, saved.learning);
  const active = buildReviewActiveNodeContext(snapshot, saved.session.currentNodeId ?? saved.session.continueNodeId ?? null);
  Object.assign(result.patch, active);
  Object.assign(result.historyEntry.afterContext, active);
  result.patch.reviewSession = saved.session;
  result.historyEntry.afterContext.reviewSession = saved.session;
  return true;
}
