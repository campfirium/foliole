import { useMemo } from 'react';

import { isCanonicalVisibleNodeId } from '../../../shared/workspaceCanonicalSelectors';
import { buildNodeTree } from '../model/nodeTree';
import { VIRTUAL_ROOT_NODE_ID, isVirtualNode, isVirtualRootNode } from '../model/specialNodes';
import { selectTrashRootIds } from '../model/trashRootModel';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

export interface NodeListTreeData {
  noteTreeBuildDurationMs: number;
  noteParentById: Record<string, string | null>;
  noteRowsAll: ReturnType<typeof buildNodeTree>['rows'];
  trashTreeBuildDurationMs: number;
  trashRowsAll: ReturnType<typeof buildNodeTree>['rows'];
  virtualTreeBuildDurationMs: number;
  virtualRowsAll: ReturnType<typeof buildNodeTree>['rows'];
}

function measureBuiltTree(nodeIds: string[], nodesById: WorkspaceListNodesById) {
  const startedAt = performance.now();
  const tree = buildNodeTree(nodeIds, nodesById);
  return { durationMs: performance.now() - startedAt, tree };
}

export function useNodeListTreeData(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: string[]
): NodeListTreeData {
  const virtualNodeOrder = useMemo(
    () =>
      nodeOrder.filter(
        (id) =>
          id === VIRTUAL_ROOT_NODE_ID ||
          (isCanonicalVisibleNodeId({ nodeOrder, nodesById, trashedNodeIds }, id) && isVirtualNode(nodesById[id]))
      ),
    [nodeOrder, nodesById, trashedNodeIds]
  );
  const visibleNodeOrder = useMemo(
    () =>
      nodeOrder.filter(
        (id) =>
          isCanonicalVisibleNodeId({ nodeOrder, nodesById, trashedNodeIds }, id) &&
          !isVirtualRootNode(nodesById[id]) &&
          !isVirtualNode(nodesById[id])
      ),
    [nodeOrder, nodesById, trashedNodeIds]
  );
  const trashedNodeOrder = useMemo(
    () => selectTrashRootIds(nodeOrder, nodesById, trashedNodeIds),
    [nodeOrder, nodesById, trashedNodeIds]
  );
  const noteTree = useMemo(() => measureBuiltTree(visibleNodeOrder, nodesById), [visibleNodeOrder, nodesById]);
  const trashTree = useMemo(() => measureBuiltTree(trashedNodeOrder, nodesById), [trashedNodeOrder, nodesById]);
  const virtualTree = useMemo(() => measureBuiltTree(virtualNodeOrder, nodesById), [virtualNodeOrder, nodesById]);

  return {
    noteParentById: noteTree.tree.parentById,
    noteRowsAll: noteTree.tree.rows,
    noteTreeBuildDurationMs: noteTree.durationMs,
    trashRowsAll: trashTree.tree.rows,
    trashTreeBuildDurationMs: trashTree.durationMs,
    virtualRowsAll: virtualTree.tree.rows,
    virtualTreeBuildDurationMs: virtualTree.durationMs
  };
}
