import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import {
  isCanonicalTrashedNodeId,
  isCanonicalVisibleNodeId
} from '../../../shared/workspaceCanonicalSelectors';
import { isVirtualNode, isVirtualRootNode } from '../model/specialNodes';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

export interface NodeSelectModifiers {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

interface NodeSelectionState {
  noteRowIds: string[];
  selectedNodeIds: string[];
  selectionAnchorNodeId: string | null;
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  setSelectionAnchorNodeId: Dispatch<SetStateAction<string | null>>;
  trashRowIds: string[];
  virtualRowIds: string[];
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

function isTrashedNode(nodeId: string, nodesById: WorkspaceListNodesById, trashedNodeIds: readonly string[]) {
  return isCanonicalTrashedNodeId({ nodeOrder: [], nodesById, trashedNodeIds }, nodeId);
}

export function useNodeListSelection(
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
    if (isSelectionScopeActive) return;
    setSelectedNodeIds([]);
    setSelectionAnchorNodeId(null);
  }, [isSelectionScopeActive]);

  useEffect(() => {
    setSelectedNodeIds((prev) => prev.filter((id) => Boolean(nodesById[id])));
    setSelectionAnchorNodeId((prev) => (prev && nodesById[prev] ? prev : null));
  }, [nodesById]);

  useEffect(() => {
    if (!selectedTrashNodeId || !isTrashedNode(selectedTrashNodeId, nodesById, trashedNodeIds)) return;
    setSelectedNodeIds((prev) => (prev.length === 0 ? [selectedTrashNodeId] : prev));
    setSelectionAnchorNodeId((prev) => prev ?? selectedTrashNodeId);
  }, [nodesById, selectedTrashNodeId, trashedNodeIds]);

  useEffect(() => {
    if (
      !activeNodeId ||
      !isCanonicalVisibleNodeId({ nodeOrder: [], nodesById, trashedNodeIds }, activeNodeId)
    ) return;
    setSelectedNodeIds((prev) => {
      if (prev.includes(activeNodeId)) {
        setSelectionAnchorNodeId((anchor) => anchor ?? activeNodeId);
        return prev;
      }
      setSelectionAnchorNodeId(activeNodeId);
      return [activeNodeId];
    });
  }, [activeNodeId, nodesById, trashedNodeIds]);

  return {
    selectedNodeIds: isSelectionScopeActive ? selectedNodeIds : [],
    setSelectedNodeIds,
    selectionAnchorNodeId: isSelectionScopeActive ? selectionAnchorNodeId : null,
    setSelectionAnchorNodeId
  };
}

function handleToggleSelection(
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
  state: NodeSelectionState;
  trashedNodeIds: string[];
}) {
  return useCallback((nodeId: string, modifiers?: NodeSelectModifiers) => {
    const isTrashNode = isTrashedNode(nodeId, nodesById, trashedNodeIds);
    const isVirtualListNode = isVirtualRootNode(nodesById[nodeId]) || isVirtualNode(nodesById[nodeId]);
    const scopeIds = isTrashNode ? state.trashRowIds : isVirtualListNode ? state.virtualRowIds : state.noteRowIds;
    const scoped = state.selectedNodeIds.filter((id) =>
      isTrashNode
        ? isTrashedNode(id, nodesById, trashedNodeIds)
        : isVirtualListNode
          ? isVirtualRootNode(nodesById[id]) || isVirtualNode(nodesById[id])
          : isCanonicalVisibleNodeId({ nodeOrder: [], nodesById, trashedNodeIds }, id)
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
  }, [activeNodeId, nodesById, onSelectNode, onSelectTrashNode, selectedTrashNodeId, state, trashedNodeIds]);
}
