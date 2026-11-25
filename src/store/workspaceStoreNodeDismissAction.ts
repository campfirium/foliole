import { collectTopicDismissIds } from '../features/nodes/model/nodeDismissTargets';
import type { Node } from '../features/nodes/model/nodeTypes';
import { hasTargetedDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowRuntimeRepository';

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
  areRelatedReadingsValid} from './workspaceActionHistoryReading';
import { settleApplicationAction } from './workspaceApplicationActionAdmission';
import { collectWorkspaceDismissChanges } from './workspaceDismissChanges';
import { prepareWorkspaceDismissLearning } from './workspaceDismissOperationLearning';
import { acceptWorkspaceHistoryCommand } from './workspaceHistoryCommandAcceptance';
import { captureWorkspaceHistoryContext, isSameWorkspaceReviewSession } from './workspaceHistoryContext';
import { getWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import { isSameNodeReading } from './workspaceNodeLearningComparison';
import { isWorkspacePartialPersistenceError } from './workspacePersistenceFailure';
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
    isSameNodeReading(node, { reading: apply.expectedReading }) &&
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
      if (state.appActionHistory.application) return settleApplicationAction(state, args.entry.id, args.entry);
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

function buildDismissNodesMutation(args: {
  nodeIds: string[];
  now: string;
  state: WorkspaceState;
  withHistory: boolean;
}) {
  const mutation = collectWorkspaceDismissChanges(args);
  const [primaryChange, ...relatedReadings] = mutation.changes;
  if (!primaryChange) return null;
  const nodes = mutation.changes
    .map((change) => mutation.nodesById[change.nodeId])
    .filter((changedNode): changedNode is Node => Boolean(changedNode));
  if (!args.withHistory) return { entry: null, nodes, nodesById: mutation.nodesById };
  const context = captureWorkspaceHistoryContext(args.state);
  const entry = createTopicDismissHistoryEntry({
    afterContext: context,
    afterReading: primaryChange.afterReading,
    beforeContext: context,
    beforeReading: primaryChange.beforeReading,
    id: createWorkspaceActionHistoryEntryId(),
    mutationTimestamp: args.now,
    nodeId: primaryChange.nodeId,
    ...(relatedReadings.length ? { relatedReadings } : {})
  });
  return { entry, nodes, nodesById: mutation.nodesById };
}

function createPreparedDismissNodesAction(set: WorkspaceSet, get?: WorkspaceGet, facts?: WorkspaceState['nodesById']): WorkspaceState['dismissNodes'] {
  return (targets, now = new Date().toISOString()) => {
    let mutation: ReturnType<typeof buildDismissNodesMutation> = null;
    acceptWorkspaceHistoryCommand(set, 'preserve', (state) => {
      if (get && (state.appActionHistory.applying || state.appActionHistory.pendingAction ||
          state.appActionHistory.pendingCreate)) return state;
      const nodeIds = Array.isArray(targets) ? targets
        : collectTopicDismissIds(targets.topicRootId, state.nodesById);
      mutation = buildDismissNodesMutation({ nodeIds, now, state: facts ? { ...state, nodesById: facts } : state, withHistory: Boolean(get) });
      if (!mutation) return state;
      if (facts && mutation.entry) mutation.entry.standalone = true;
      return {
        ...(mutation.entry
          ? { appActionHistory: beginWorkspaceAction(state.appActionHistory, mutation.entry) }
          : {}),
        nodesById: mutation.nodesById
      };
    });
    const result = mutation as NonNullable<ReturnType<typeof buildDismissNodesMutation>> | null;
    if (result?.entry && get) finishDismissPersistence({ entry: result.entry, get, nodes: result.nodes, now, set });
    else if (result) void persistDismissedReadingNodes(result.nodes, now);
    return Boolean(result);
  };
}

export function createDismissNodesAction(set: WorkspaceSet, get?: WorkspaceGet): WorkspaceState['dismissNodes'] {
  return (targets, now = new Date().toISOString()) => {
    if (!get || !hasTargetedDailyFlowRuntime()) return createPreparedDismissNodesAction(set, get)(targets, now);
    const before = get();
    if (before.appActionHistory.applying || before.appActionHistory.pendingAction || before.appActionHistory.pendingCreate) return false;
    const ids = Array.isArray(targets) ? targets : collectTopicDismissIds(targets.topicRootId, before.nodesById);
    if (!ids.some(id => before.nodesById[id] && !before.trashedNodeIds.includes(id))) return false;
    void prepareWorkspaceDismissLearning(before, ids, get, facts => createPreparedDismissNodesAction(set, get, facts)(ids, now));
    return true;
  };
}

export function createDismissNodeAction(set: WorkspaceSet, get?: WorkspaceGet): WorkspaceState['dismissNode'] {
  const dismissNodes = createDismissNodesAction(set, get);
  return (nodeId, now) => dismissNodes([nodeId], now);
}
