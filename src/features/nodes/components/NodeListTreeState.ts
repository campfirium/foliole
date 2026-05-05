import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';

import { useWorkspaceStore } from '../../../store/workspaceStore';
import {
  buildFlatNodeRows,
  buildNodeTree,
  buildVisibleNodeTreeRows,
  type NodeTreeRow
} from '../model/nodeTree';
import { isVirtualNode, isVirtualRootNode } from '../model/specialNodes';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

export interface NodeSelectModifiers {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

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

export function collectRangeNodeIds(nodeIds: string[], anchorNodeId: string, targetNodeId: string) {
  const anchorIndex = nodeIds.indexOf(anchorNodeId);
  const targetIndex = nodeIds.indexOf(targetNodeId);
  if (anchorIndex < 0 || targetIndex < 0) {
    return [targetNodeId];
  }
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return nodeIds.slice(start, end + 1);
}

function useScopedNodeOrders(nodeOrder: string[], nodesById: WorkspaceListNodesById, trashedNodeIds: string[]) {
  const noteNodeOrder = useMemo(
    () =>
      nodeOrder.filter(
        (id) => !trashedNodeIds.includes(id) && !isVirtualRootNode(nodesById[id]) && !isVirtualNode(nodesById[id])
      ),
    [nodeOrder, nodesById, trashedNodeIds]
  );
  const virtualNodeOrder = useMemo(
    () =>
      nodeOrder.filter(
        (id) => !trashedNodeIds.includes(id) && (isVirtualRootNode(nodesById[id]) || isVirtualNode(nodesById[id]))
      ),
    [nodeOrder, nodesById, trashedNodeIds]
  );
  const trashedNodeOrder = useMemo(
    () => nodeOrder.filter((id) => trashedNodeIds.includes(id)),
    [nodeOrder, trashedNodeIds]
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
  const trashRowsAll = useMemo(
    () => buildFlatNodeRows(scopedNodeOrder.trashedNodeOrder, nodesById),
    [scopedNodeOrder.trashedNodeOrder, nodesById]
  );
  const virtualTree = useMemo(
    () => buildNodeTree(scopedNodeOrder.virtualNodeOrder, nodesById),
    [scopedNodeOrder.virtualNodeOrder, nodesById]
  );

  return { noteTree, trashRowsAll, virtualTree };
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
  const { noteTree, trashRowsAll, virtualTree } = useScopedNodeTrees(scopedNodeOrder, nodesById);
  const noteRows = useMemo(
    () => buildVisibleNodeTreeRows(noteTree.rows, collapsedNoteNodeIds),
    [noteTree.rows, collapsedNoteNodeIds]
  );
  const trashRows = useMemo(
    () => trashRowsAll,
    [trashRowsAll]
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
    trashRowsAll,
    virtualRows,
    virtualRowsAll: virtualTree.rows,
    noteRowIds: noteRows.map((row) => row.node.id),
    trashRowIds: trashRows.map((row) => row.node.id),
    virtualRowIds: virtualRows.map((row) => row.node.id),
    ...selectionState
  };
}

function useNodeListSelection(
  activeNodeId: string | null,
  isSelectionScopeActive: boolean,
  nodesById: WorkspaceListNodesById,
  selectedTrashNodeId: string | null,
  trashedNodeIds: string[]
) {
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(
    activeNodeId ? [activeNodeId] : []
  );
  const [selectionAnchorNodeId, setSelectionAnchorNodeId] = useState<string | null>(activeNodeId);

  useEffect(() => {
    if (isSelectionScopeActive) {
      return;
    }
    setSelectedNodeIds([]);
    setSelectionAnchorNodeId(null);
  }, [isSelectionScopeActive]);

  useEffect(() => {
    setSelectedNodeIds((prev) => prev.filter((id) => Boolean(nodesById[id])));
    setSelectionAnchorNodeId((prev) => (prev && nodesById[prev] ? prev : null));
  }, [nodesById]);

  useEffect(() => {
    if (!selectedTrashNodeId || !trashedNodeIds.includes(selectedTrashNodeId)) return;
    setSelectedNodeIds((prev) => (prev.length === 0 ? [selectedTrashNodeId] : prev));
    setSelectionAnchorNodeId((prev) => prev ?? selectedTrashNodeId);
  }, [selectedTrashNodeId, trashedNodeIds]);

  useEffect(() => {
    if (!activeNodeId || trashedNodeIds.includes(activeNodeId)) return;
    setSelectedNodeIds((prev) => (prev.includes(activeNodeId) ? prev : [activeNodeId]));
    setSelectionAnchorNodeId(activeNodeId);
  }, [activeNodeId, trashedNodeIds]);

  return {
    selectedNodeIds: isSelectionScopeActive ? selectedNodeIds : [],
    setSelectedNodeIds,
    selectionAnchorNodeId: isSelectionScopeActive ? selectionAnchorNodeId : null,
    setSelectionAnchorNodeId
  };
}

export function handleToggleSelection(
  nodeId: string,
  scopedSelection: string[],
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>,
  setSelectionAnchorNodeId: Dispatch<SetStateAction<string | null>>,
  notify: (nodeId: string) => void
) {
  const isSelected = scopedSelection.includes(nodeId);
  if (isSelected && scopedSelection.length > 1) {
    const next = scopedSelection.filter((id) => id !== nodeId);
    setSelectedNodeIds(next);
    notify(next[next.length - 1] ?? nodeId);
    return;
  }
  if (!isSelected) {
    setSelectedNodeIds([...scopedSelection, nodeId]);
    setSelectionAnchorNodeId(nodeId);
    notify(nodeId);
  }
}

export function useNodeSelectionHandler({
  activeNodeId,
  isSelectionScopeActive,
  nodesById,
  onSelectNode,
  onSelectTrashNode,
  selectedTrashNodeId,
  state,
  trashedNodeIds
}: {
  activeNodeId: string | null;
  isSelectionScopeActive: boolean;
  nodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  selectedTrashNodeId: string | null;
  state: NodeListState;
  trashedNodeIds: string[];
}) {
  return useCallback((nodeId: string, modifiers?: NodeSelectModifiers) => {
    const isTrashNode = trashedNodeIds.includes(nodeId);
    const isVirtualListNode = isVirtualRootNode(nodesById[nodeId]) || isVirtualNode(nodesById[nodeId]);
    const scopeIds = isTrashNode ? state.trashRowIds : isVirtualListNode ? state.virtualRowIds : state.noteRowIds;
    const scoped = state.selectedNodeIds.filter((id) =>
      isTrashNode
        ? trashedNodeIds.includes(id)
        : isVirtualListNode
          ? isVirtualRootNode(nodesById[id]) || isVirtualNode(nodesById[id])
          : !trashedNodeIds.includes(id)
    );
    const notify = isTrashNode ? onSelectTrashNode : onSelectNode;
    const fallbackAnchor = isTrashNode ? (selectedTrashNodeId ?? nodeId) : (activeNodeId ?? nodeId);
    if (modifiers?.shiftKey) {
      state.setSelectedNodeIds(
        collectRangeNodeIds(scopeIds, state.selectionAnchorNodeId ?? fallbackAnchor, nodeId)
      );
      notify(nodeId);
      return;
    }
    if (modifiers?.metaKey || modifiers?.ctrlKey) {
      handleToggleSelection(
        nodeId,
        scoped,
        state.setSelectedNodeIds,
        state.setSelectionAnchorNodeId,
        notify
      );
      return;
    }
    state.setSelectedNodeIds([nodeId]);
    state.setSelectionAnchorNodeId(nodeId);
    notify(nodeId);
  }, [activeNodeId, isSelectionScopeActive, nodesById, onSelectNode, onSelectTrashNode, selectedTrashNodeId, state, trashedNodeIds]);
}
