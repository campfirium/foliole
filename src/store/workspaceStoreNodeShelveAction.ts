import type { Node } from '../features/nodes/model/nodeTypes';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { hasTargetedDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowRuntimeRepository';

import {
  beginWorkspaceAction
} from './workspaceActionHistory';
import { createWorkspaceActionHistoryEntryId } from './workspaceActionHistoryEntry';
import { acceptWorkspaceHistoryCommand } from './workspaceHistoryCommandAcceptance';
import {
  captureWorkspaceHistoryContext
} from './workspaceHistoryContext';
import { getWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import { beginDatabaseShelveAction } from './workspaceNodeShelveDatabaseAction';
import { finishNodeShelveHistoryPersistence } from './workspaceNodeShelveHistoryCommit';
import { buildSequentialReadingMaintenancePatch } from './workspaceSequentialReadingMaintenance';
import { createTopicShelveHistoryEntry, type WorkspaceTopicShelveHistoryEntry } from './workspaceShelveActionHistory';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;

export function isShelvableTopic(node: Node | undefined, state: WorkspaceState): node is Node {
  return Boolean(
    node &&
      node.kind === 'topic' &&
      !node.specialKind &&
      !node.anchorLink &&
      !state.trashedNodeIds.includes(node.id)
  );
}

export function buildNodeShelveMutation(args: {
  mode: 'shelve' | 'unshelve';
  nodeId: string;
  now: string;
  state: WorkspaceState;
}) {
  const node = args.state.nodesById[args.nodeId];
  if (!isShelvableTopic(node, args.state)) return null;
  const beforeShelvedAt = node.shelvedAt ?? null;
  const afterShelvedAt = args.mode === 'shelve' ? args.now : null;
  if (beforeShelvedAt === afterShelvedAt || (args.mode === 'unshelve' && !beforeShelvedAt)) return null;
  const nextNode = { ...node, shelvedAt: afterShelvedAt, updatedAt: args.now };
  const nextNodesById = { ...args.state.nodesById, [args.nodeId]: nextNode };
  const sequentialPatch = buildSequentialReadingMaintenancePatch({
    changedRootNodeIds: [args.nodeId],
    defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
    nodeOrder: args.state.nodeOrder,
    nodesById: nextNodesById,
    now: args.now,
    previousNodesById: args.state.nodesById
  });
  const finalNodesById = sequentialPatch?.nodesById ?? nextNodesById;
  const nextNodesForSync = [
    nextNode,
    ...(sequentialPatch?.changes ?? [])
      .map((change) => finalNodesById[change.nodeId])
      .filter((changedNode): changedNode is Node => Boolean(changedNode))
  ];
  return {
    changes: sequentialPatch?.changes ?? [],
    nextNodesForSync,
    patch: {
      nodesById: finalNodesById
    }
  };
}

function createSetNodeShelvedAtAction(
  set: WorkspaceSet,
  mode: 'shelve' | 'unshelve',
  get?: WorkspaceGet
): WorkspaceState['shelveNode'] | WorkspaceState['unshelveNode'] {
  return (nodeId, now = new Date().toISOString()) => {
    if (get && hasTargetedDailyFlowRuntime()) return beginDatabaseShelveAction({ set, get, mode, nodeId, now,
      eligible: isShelvableTopic, buildMutation: buildNodeShelveMutation });
    let changed = false;
    let nextNodesForSync: Node[] = [];
    let historyEntry: WorkspaceTopicShelveHistoryEntry | null = null;
    let beforeNodesById: WorkspaceState['nodesById'] = {};
    acceptWorkspaceHistoryCommand(set, 'preserve', (state) => {
      if (get && (state.appActionHistory.applying || state.appActionHistory.pendingAction ||
          state.appActionHistory.pendingCreate)) return state;
      const mutation = buildNodeShelveMutation({ mode, nodeId, now, state });
      if (!mutation) return state;
      changed = true;
      nextNodesForSync = mutation.nextNodesForSync;
      if (get) {
        const affectedNodeIds = [nodeId, ...mutation.changes.map(({ nodeId: changedNodeId }) => changedNodeId)];
        beforeNodesById = Object.fromEntries(affectedNodeIds.flatMap((affectedNodeId) => {
          const beforeNode = state.nodesById[affectedNodeId];
          return beforeNode ? [[affectedNodeId, beforeNode]] : [];
        }));
        historyEntry = createTopicShelveHistoryEntry({
          afterContext: captureWorkspaceHistoryContext(state),
          afterShelvedAt: mutation.patch.nodesById[nodeId]?.shelvedAt ?? null,
          beforeContext: captureWorkspaceHistoryContext(state),
          beforeShelvedAt: state.nodesById[nodeId]?.shelvedAt ?? null,
          id: createWorkspaceActionHistoryEntryId(),
          mutationTimestamp: now,
          nodeId,
          ...(mutation.changes.length ? { relatedReadings: mutation.changes } : {})
        });
      }
      return {
        ...mutation.patch,
        ...(historyEntry
          ? { appActionHistory: beginWorkspaceAction(state.appActionHistory, historyEntry) }
          : {})
      };
    });
    const entry = historyEntry as WorkspaceTopicShelveHistoryEntry | null;
    if (entry && get) {
      finishNodeShelveHistoryPersistence({ beforeNodesById, entry, get, nodes: nextNodesForSync, now, set });
    }
    else if (nextNodesForSync.length > 0) {
      void getWorkspaceHistoryPersistence().persistShelveSnapshots(nextNodesForSync, now);
    }
    return changed;
  };
}

export function createShelveNodeAction(set: WorkspaceSet, get?: WorkspaceGet): WorkspaceState['shelveNode'] {
  return createSetNodeShelvedAtAction(set, 'shelve', get);
}

export function createUnshelveNodeAction(set: WorkspaceSet, get?: WorkspaceGet): WorkspaceState['unshelveNode'] {
  return createSetNodeShelvedAtAction(set, 'unshelve', get);
}
