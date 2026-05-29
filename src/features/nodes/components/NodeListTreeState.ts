import { useMemo, type Dispatch, type SetStateAction } from 'react';

import { isCanonicalVisibleNodeId } from '../../../shared/workspaceCanonicalSelectors';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import {
  buildNodeTree,
  buildVisibleNodeTreeRows,
  type NodeTreeRow
} from '../model/nodeTree';
import { isVirtualNode, isVirtualRootNode } from '../model/specialNodes';
import { selectTrashRootIds } from '../model/trashRootModel';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { useNodeListSelection } from './NodeListSelection';
import type { NodeListTreeData } from './NodeListTreeData';

export { collectRangeNodeIds, useNodeSelectionHandler } from './NodeListSelection';
export type { NodeSelectModifiers } from './NodeListSelection';

export interface NodeListState {
  noteRows: NodeTreeRow[];
  noteRowsAll: NodeTreeRow[];
  noteParentById: Record<string, string | null>;
  trashRows: NodeTreeRow[];
  trashRowsAll: NodeTreeRow[];
  virtualRows: NodeTreeRow[];
  virtualRowsAll: NodeTreeRow[];
  noteRowIds: string[];
  trashRowIds: string[];
  virtualRowIds: string[];
  selectedNodeIds: string[];
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  selectionAnchorNodeId: string | null;
  setSelectionAnchorNodeId: Dispatch<SetStateAction<string | null>>;
}

function useScopedNodeOrders(nodeOrder: string[], nodesById: WorkspaceListNodesById, trashedNodeIds: string[]) {
  const noteNodeOrder = useMemo(
    () =>
      nodeOrder.filter(
        (id) =>
          isCanonicalVisibleNodeId({ nodeOrder, nodesById, trashedNodeIds }, id) &&
          !isVirtualRootNode(nodesById[id]) &&
          !isVirtualNode(nodesById[id])
      ),
    [nodeOrder, nodesById, trashedNodeIds]
  );
  const virtualNodeOrder = useMemo(
    () =>
      nodeOrder.filter(
        (id) =>
          isCanonicalVisibleNodeId({ nodeOrder, nodesById, trashedNodeIds }, id) &&
          (isVirtualRootNode(nodesById[id]) || isVirtualNode(nodesById[id]))
      ),
    [nodeOrder, nodesById, trashedNodeIds]
  );
  const trashedNodeOrder = useMemo(
    () => selectTrashRootIds(nodeOrder, nodesById, trashedNodeIds),
    [nodeOrder, nodesById, trashedNodeIds]
  );

  return { noteNodeOrder, trashedNodeOrder, virtualNodeOrder };
}

function useScopedNodeTrees(
  scopedNodeOrder: ReturnType<typeof useScopedNodeOrders>,
  nodesById: WorkspaceListNodesById
) {
  const noteTree = useMemo(
    () => buildNodeTree(scopedNodeOrder.noteNodeOrder, nodesById),
    [scopedNodeOrder.noteNodeOrder, nodesById]
  );
  const trashTree = useMemo(
    () => buildNodeTree(scopedNodeOrder.trashedNodeOrder, nodesById),
    [scopedNodeOrder.trashedNodeOrder, nodesById]
  );
  const virtualTree = useMemo(
    () => buildNodeTree(scopedNodeOrder.virtualNodeOrder, nodesById),
    [scopedNodeOrder.virtualNodeOrder, nodesById]
  );

  return { noteTree, trashTree, virtualTree };
}

export function useNodeListState(
  activeNodeId: string | null,
  isSelectionScopeActive: boolean,
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  selectedTrashNodeId: string | null,
  collapsedNoteNodeIds: ReadonlySet<string>
): NodeListState {
  const trashedNodeIds = useWorkspaceStore((state) => state.trashedNodeIds);
  const scopedNodeOrder = useScopedNodeOrders(nodeOrder, nodesById, trashedNodeIds);
  const { noteTree, trashTree, virtualTree } = useScopedNodeTrees(scopedNodeOrder, nodesById);
  const noteRows = useMemo(
    () => buildVisibleNodeTreeRows(noteTree.rows, collapsedNoteNodeIds),
    [noteTree.rows, collapsedNoteNodeIds]
  );
  const trashRows = useMemo(
    () => trashTree.rows,
    [trashTree.rows]
  );
  const virtualRows = useMemo(
    () => buildVisibleNodeTreeRows(virtualTree.rows, collapsedNoteNodeIds),
    [virtualTree.rows, collapsedNoteNodeIds]
  );
  const selectionState = useNodeListSelection(
    activeNodeId,
    isSelectionScopeActive,
    nodesById,
    selectedTrashNodeId,
    trashedNodeIds
  );

  return {
    noteRows,
    noteRowsAll: noteTree.rows,
    noteParentById: noteTree.parentById,
    trashRows,
    trashRowsAll: trashTree.rows,
    virtualRows,
    virtualRowsAll: virtualTree.rows,
    noteRowIds: noteRows.map((row) => row.node.id),
    trashRowIds: trashRows.map((row) => row.node.id),
    virtualRowIds: virtualRows.map((row) => row.node.id),
    ...selectionState
  };
}

export function useNodeListStateFromTreeData(args: {
  activeNodeId: string | null;
  collapsedNoteNodeIds: ReadonlySet<string>;
  isSelectionScopeActive: boolean;
  nodesById: WorkspaceListNodesById;
  selectedTrashNodeId: string | null;
  treeData: NodeListTreeData;
}): NodeListState {
  const trashedNodeIds = useWorkspaceStore((state) => state.trashedNodeIds);
  const noteRows = useMemo(
    () => buildVisibleNodeTreeRows(args.treeData.noteRowsAll, args.collapsedNoteNodeIds),
    [args.treeData.noteRowsAll, args.collapsedNoteNodeIds]
  );
  const trashRows = useMemo(() => args.treeData.trashRowsAll, [args.treeData.trashRowsAll]);
  const virtualRows = useMemo(
    () => buildVisibleNodeTreeRows(args.treeData.virtualRowsAll, args.collapsedNoteNodeIds),
    [args.treeData.virtualRowsAll, args.collapsedNoteNodeIds]
  );
  const selectionState = useNodeListSelection(
    args.activeNodeId,
    args.isSelectionScopeActive,
    args.nodesById,
    args.selectedTrashNodeId,
    trashedNodeIds
  );

  return {
    noteRows,
    noteRowsAll: args.treeData.noteRowsAll,
    noteParentById: args.treeData.noteParentById,
    trashRows,
    trashRowsAll: args.treeData.trashRowsAll,
    virtualRows,
    virtualRowsAll: args.treeData.virtualRowsAll,
    noteRowIds: noteRows.map((row) => row.node.id),
    trashRowIds: trashRows.map((row) => row.node.id),
    virtualRowIds: virtualRows.map((row) => row.node.id),
    ...selectionState
  };
}
