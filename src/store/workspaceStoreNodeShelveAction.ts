import type { Node } from '../features/nodes/model/nodeTypes';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { pushWorkspaceUndoEntry } from './workspaceActionHistory';
import { buildCurrentReviewSessionQueueOutput } from './workspaceReviewLiveQueue';
import { completeReviewSession } from './workspaceReviewReading';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import { buildSequentialReadingMaintenancePatch } from './workspaceSequentialReadingMaintenance';
import { createTopicShelveHistoryEntry } from './workspaceShelveActionHistory';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

function isShelvableTopic(node: Node | undefined, state: WorkspaceState): node is Node {
  return Boolean(
    node &&
      node.kind === 'topic' &&
      !node.specialKind &&
      !node.anchorLink &&
      !state.trashedNodeIds.includes(node.id)
  );
}

function hasShelvedAncestor(nodeId: string, nodesById: WorkspaceState['nodesById']) {
  const visitedNodeIds = new Set<string>();
  let currentNode: Node | undefined = nodesById[nodeId];
  while (currentNode && !visitedNodeIds.has(currentNode.id)) {
    if (currentNode.shelvedAt) {
      return true;
    }
    visitedNodeIds.add(currentNode.id);
    currentNode = currentNode.parentNodeId ? nodesById[currentNode.parentNodeId] : undefined;
  }
  return false;
}

function areNodeIdsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((nodeId, index) => nodeId === right[index]);
}

function buildReviewSessionRefreshPatch(args: {
  mode: 'shelve' | 'unshelve';
  nextNodesById: WorkspaceState['nodesById'];
  now: string;
  state: WorkspaceState;
}) {
  const currentNodeId = args.state.reviewSession.currentNodeId;
  if (!currentNodeId) {
    return null;
  }
  const currentNodeWasShelved = args.mode === 'shelve' && hasShelvedAncestor(currentNodeId, args.nextNodesById);
  const nextQueue = buildCurrentReviewSessionQueueOutput(args.state, args.now, {
    nodesById: args.nextNodesById,
    releaseCurrentPin: currentNodeWasShelved
  });
  if (!nextQueue.currentNodeId) {
    return {
      activeNodeId: args.state.activeNodeId,
      reviewSession: completeReviewSession(args.state.reviewSession, {
        completedAt: args.now,
        continueNodeId: nextQueue.extensionNodeIds[0] ?? null
      })
    };
  }
  const nextReviewSession = {
    ...args.state.reviewSession,
    completedAt: null,
    currentNodeId: nextQueue.currentNodeId,
    isAnswerRevealed: currentNodeWasShelved ? false : args.state.reviewSession.isAnswerRevealed,
    queueNodeIds: nextQueue.taskNodeIds,
    totalNodeCount: Math.max(args.state.reviewSession.totalNodeCount, nextQueue.taskNodeIds.length)
  };
  if (
    !currentNodeWasShelved &&
    nextReviewSession.currentNodeId === args.state.reviewSession.currentNodeId &&
    areNodeIdsEqual(nextReviewSession.queueNodeIds, args.state.reviewSession.queueNodeIds)
  ) {
    return null;
  }
  return {
    activeNodeId: currentNodeWasShelved ? nextQueue.currentNodeId : args.state.activeNodeId,
    reviewSession: nextReviewSession
  };
}

function buildNodeShelveMutation(args: {
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
  const reviewSessionPatch = buildReviewSessionRefreshPatch({
    mode: args.mode,
    nextNodesById: finalNodesById,
    now: args.now,
    state: args.state
  });
  return {
    nextNodesForSync,
    patch: {
      ...(reviewSessionPatch ?? {}),
      appActionHistory: pushWorkspaceUndoEntry(
        args.state.appActionHistory,
        createTopicShelveHistoryEntry({
          ...(reviewSessionPatch
            ? {
                afterReviewSession: reviewSessionPatch.reviewSession,
                beforeReviewSession: args.state.reviewSession
              }
            : {}),
          afterShelvedAt,
          beforeShelvedAt,
          nodeId: args.nodeId,
          ...(sequentialPatch?.changes.length ? { relatedReadings: sequentialPatch.changes } : {})
        })
      ),
      nodesById: finalNodesById
    }
  };
}

function createSetNodeShelvedAtAction(
  set: WorkspaceSet,
  mode: 'shelve' | 'unshelve'
): WorkspaceState['shelveNode'] | WorkspaceState['unshelveNode'] {
  return (nodeId, now = new Date().toISOString()) => {
    let changed = false;
    let nextNodesForSync: Node[] = [];
    set((state) => {
      const mutation = buildNodeShelveMutation({ mode, nodeId, now, state });
      if (!mutation) return state;
      changed = true;
      nextNodesForSync = mutation.nextNodesForSync;
      return mutation.patch;
    });
    if (nextNodesForSync.length > 0) {
      nextNodesForSync.forEach((node) => syncNodeContentToRuntime(node));
    }
    return changed;
  };
}

export function createShelveNodeAction(set: WorkspaceSet): WorkspaceState['shelveNode'] {
  return createSetNodeShelvedAtAction(set, 'shelve');
}

export function createUnshelveNodeAction(set: WorkspaceSet): WorkspaceState['unshelveNode'] {
  return createSetNodeShelvedAtAction(set, 'unshelve');
}
