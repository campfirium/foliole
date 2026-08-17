import { hasNodeContent, type Node } from '../features/nodes/model/nodeTypes';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import {
  beginWorkspaceAction,
  createEmptyWorkspaceActionHistory,
  failWorkspaceAction,
  settleWorkspaceAction
} from './workspaceActionHistory';
import { createWorkspaceActionHistoryEntryId } from './workspaceActionHistoryEntry';
import {
  applyReadingSnapshot,
  applyRelatedReadingSnapshots,
  areRelatedReadingsValid,
  isSameReadingProfile
} from './workspaceActionHistoryReading';
import { captureWorkspaceHistoryContext, isSameWorkspaceReviewSession } from './workspaceHistoryContext';
import { getWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import { isWorkspacePartialPersistenceError } from './workspacePersistenceFailure';
import { buildDismissedReadingProfile } from './workspaceReviewReading';
import { buildSequentialReadingDismissPatch } from './workspaceSequentialReading';
import type { WorkspaceState } from './workspaceStore';
import {
  createTopicDismissHistoryEntry,
  resolveTopicReadingHistoryApply,
  type WorkspaceTopicDismissHistoryEntry
} from './workspaceTopicDismissActionHistory';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;

function persistDismissedReadingNodes(nodes: WorkspaceState['nodesById'][string][], updatedAt: string) {
  return getWorkspaceHistoryPersistence().persistReadingSnapshots(nodes, updatedAt);
}

function isDismissEntryApplicable(state: WorkspaceState, entry: WorkspaceTopicDismissHistoryEntry) {
  const apply = resolveTopicReadingHistoryApply(entry, 'undo');
  const node = state.nodesById[entry.nodeId];
  return Boolean(node &&
    isSameReadingProfile(node.reading, apply.expectedReading) &&
    areRelatedReadingsValid(apply.relatedReadings, state.nodesById) &&
    isSameWorkspaceReviewSession(state.reviewSession, entry.afterContext.reviewSession));
}

function revertDismissEntry(state: WorkspaceState, entry: WorkspaceTopicDismissHistoryEntry) {
  const apply = resolveTopicReadingHistoryApply(entry, 'undo');
  const node = state.nodesById[entry.nodeId]!;
  const nodesById = {
    ...state.nodesById,
    [entry.nodeId]: applyReadingSnapshot(node, apply.nextReading)
  };
  applyRelatedReadingSnapshots({ nextNodesById: nodesById, readings: apply.relatedReadings });
  return nodesById;
}

function finishDismissPersistence(args: {
  entry: WorkspaceTopicDismissHistoryEntry;
  get: WorkspaceGet;
  nodes: Node[];
  now: string;
  set: WorkspaceSet;
}) {
  void persistDismissedReadingNodes(args.nodes, args.now).then((persisted) => {
    let undoRequested = false;
    args.set((state) => {
      if (!persisted) {
        if (!isDismissEntryApplicable(state, args.entry)) {
          return { appActionHistory: createEmptyWorkspaceActionHistory() };
        }
        return {
          appActionHistory: failWorkspaceAction(state.appActionHistory, args.entry.id),
          nodesById: revertDismissEntry(state, args.entry)
        };
      }
      if (!isDismissEntryApplicable(state, args.entry) ||
          state.appActionHistory.pendingAction?.entry.id !== args.entry.id) {
        return { appActionHistory: createEmptyWorkspaceActionHistory() };
      }
      const settled = settleWorkspaceAction(state.appActionHistory, args.entry.id);
      undoRequested = settled.undoRequested;
      return { appActionHistory: settled.history };
    });
    if (undoRequested) args.get().undoWorkspaceAction(args.entry.id);
  }).catch((error) => {
    args.set((state) => {
      if (isWorkspacePartialPersistenceError(error)) {
        return { appActionHistory: createEmptyWorkspaceActionHistory() };
      }
      if (!isDismissEntryApplicable(state, args.entry)) {
        return { appActionHistory: createEmptyWorkspaceActionHistory() };
      }
      return {
        appActionHistory: failWorkspaceAction(state.appActionHistory, args.entry.id),
        nodesById: revertDismissEntry(state, args.entry)
      };
    });
  });
}

function buildDismissNodeMutation(args: {
  nodeId: string;
  now: string;
  state: WorkspaceState;
  withHistory: boolean;
}) {
  const node = args.state.nodesById[args.nodeId];
  if (!node || isProtectedRootNode(node) || !hasNodeContent(node) ||
      !isReadingReviewItemNode(node) || node.reading?.state === 'dismissed') return null;
  const defaultPriority = getCurrentReviewSchedulerSettings().pushQueue.defaultPriority;
  const afterReading = buildDismissedReadingProfile({
    currentNodeId: args.nodeId,
    currentReading: node.reading,
    defaultPriority,
    nodesById: args.state.nodesById,
    now: args.now
  });
  const nextNode: Node = { ...node, reading: afterReading };
  const nextNodesById = { ...args.state.nodesById, [args.nodeId]: nextNode };
  const sequentialPatch = buildSequentialReadingDismissPatch({
    defaultPriority,
    dismissedNodeId: args.nodeId,
    nodeOrder: args.state.nodeOrder,
    nodesById: nextNodesById,
    now: args.now
  });
  const finalNodesById = sequentialPatch?.nodesById ?? nextNodesById;
  const nodes = [nextNode, ...(sequentialPatch?.changes ?? [])
    .map((change) => finalNodesById[change.nodeId])
    .filter((changedNode): changedNode is Node => Boolean(changedNode))];
  if (!args.withHistory) return { entry: null, nodes, nodesById: finalNodesById };
  const context = captureWorkspaceHistoryContext(args.state);
  const entry = createTopicDismissHistoryEntry({
    afterContext: context,
    afterReading,
    beforeContext: context,
    beforeReading: node.reading,
    id: createWorkspaceActionHistoryEntryId(),
    mutationTimestamp: args.now,
    nodeId: args.nodeId,
    ...(sequentialPatch?.changes.length ? { relatedReadings: sequentialPatch.changes } : {})
  });
  return { entry, nodes, nodesById: finalNodesById };
}

export function createDismissNodeAction(set: WorkspaceSet, get?: WorkspaceGet): WorkspaceState['dismissNode'] {
  return (nodeId, now = new Date().toISOString()) => {
    let mutation: ReturnType<typeof buildDismissNodeMutation> = null;
    set((state) => {
      if (get && (state.appActionHistory.applying || state.appActionHistory.pendingAction ||
          state.appActionHistory.pendingCreate)) return state;
      mutation = buildDismissNodeMutation({ nodeId, now, state, withHistory: Boolean(get) });
      if (!mutation) return state;
      return {
        ...(mutation.entry
          ? { appActionHistory: beginWorkspaceAction(state.appActionHistory, mutation.entry) }
          : {}),
        nodesById: mutation.nodesById
      };
    });
    const result = mutation as NonNullable<ReturnType<typeof buildDismissNodeMutation>> | null;
    if (result?.entry && get) finishDismissPersistence({ entry: result.entry, get, nodes: result.nodes, now, set });
    else if (result) void persistDismissedReadingNodes(result.nodes, now);
    return Boolean(result);
  };
}
