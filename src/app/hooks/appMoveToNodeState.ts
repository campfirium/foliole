import { canNodeAcceptMovedChildren } from '../../features/nodes/model/nodeContainers';
import { canNodeBeMoved } from '../../features/nodes/model/nodeMovementRules';
import { isNodeInSubtree } from '../../store/workspaceNodeTreeOrder';
import { isCurrentViewTopicSnapshotStillCurrent, type CurrentViewTopicSnapshot } from '../currentViewTopicSnapshot';

import { buildGoToNodeState } from './appControllerHelpers';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import type { AppGoToNodeState } from './appGoToNodeState';

function collectValidMoveSourceSnapshots(args: {
  activeNodeId: string | null;
  nodesById: ReturnType<typeof useWorkspaceSelectors>['nodesById'];
  sourceSnapshot: CurrentViewTopicSnapshot[] | null;
  trashedNodeIds: string[];
}) {
  const trashedNodeIdSet = new Set(args.trashedNodeIds);
  if (args.sourceSnapshot) {
    return args.sourceSnapshot.filter((snapshot) => {
      const node = args.nodesById[snapshot.id];
      return isCurrentViewTopicSnapshotStillCurrent(snapshot, node, trashedNodeIdSet) && canNodeBeMoved(node);
    });
  }
  const activeNode = args.activeNodeId ? args.nodesById[args.activeNodeId] : undefined;
  if (!args.activeNodeId || !canNodeBeMoved(activeNode)) {
    return [];
  }
  return [{
    anchorLink: activeNode?.anchorLink,
    id: args.activeNodeId,
    kind: activeNode?.kind ?? 'topic',
    parentNodeId: activeNode?.parentNodeId ?? null
  }];
}

function isMoveTargetForAllSources(args: {
  movedNodeIds: ReadonlySet<string>;
  nodesById: ReturnType<typeof useWorkspaceSelectors>['nodesById'];
  sourceIds: string[];
  targetNodeId: string;
  nodeOrder: string[];
  trashedNodeIds: string[];
}) {
  if (args.movedNodeIds.has(args.targetNodeId) || args.trashedNodeIds.includes(args.targetNodeId)) {
    return false;
  }
  if (args.sourceIds.some((sourceId) => isNodeInSubtree(args.targetNodeId, sourceId, args.nodesById))) {
    return false;
  }
  const trashedNodeIdSet = new Set(args.trashedNodeIds);
  return args.sourceIds.every((sourceId) =>
    canNodeAcceptMovedChildren(
      args.targetNodeId,
      args.nodeOrder,
      args.nodesById,
      sourceId,
      trashedNodeIdSet
    )
  );
}

export function buildControllerMoveToNodeState(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}): AppGoToNodeState {
  const isOpen = args.runtime.isMoveToNodePaletteOpen;
  const sourceSnapshots = isOpen
    ? collectValidMoveSourceSnapshots({
      activeNodeId: args.ws.activeNodeId,
      nodesById: args.ws.nodesById,
      sourceSnapshot: args.runtime.moveToNodeSourceSnapshot,
      trashedNodeIds: args.ws.trashedNodeIds
    })
    : [];
  const sourceIds = sourceSnapshots.map((snapshot) => snapshot.id);
  const movedNodeIds = new Set(sourceIds);
  const targetNodeOrder = sourceIds.length > 0
    ? args.ws.nodeOrder.filter((nodeId) => {
        return isMoveTargetForAllSources({
          movedNodeIds,
          nodeOrder: args.ws.nodeOrder,
          nodesById: args.ws.nodesById,
          sourceIds,
          targetNodeId: nodeId,
          trashedNodeIds: args.ws.trashedNodeIds
        });
      })
    : [];

  return buildGoToNodeState(
    isOpen,
    targetNodeOrder,
    isOpen ? args.ws.nodesById : {},
    args.runtime.recentNodeIds,
    args.ws.trashedNodeIds,
    args.runtime.closeMoveToNodePalette,
    async (nodeId) => {
      const validSourceIds = collectValidMoveSourceSnapshots({
        activeNodeId: args.ws.activeNodeId,
        nodesById: args.ws.nodesById,
        sourceSnapshot: args.runtime.moveToNodeSourceSnapshot,
        trashedNodeIds: args.ws.trashedNodeIds
      }).map((snapshot) => snapshot.id);
      if (validSourceIds.length === 0) {
        args.runtime.closeMoveToNodePalette();
        return;
      }
      args.runtime.recordRecentNode(nodeId);
      if (await args.ws.moveNodes(validSourceIds, nodeId, 'child')) {
        args.runtime.closeMoveToNodePalette();
      }
    }
  );
}
