import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction
} from 'react';

import { useWorkspaceStore } from '../../../store/workspaceStore';
import { buildNodeTree, buildVisibleNodeTreeRows, type NodeTreeRow } from '../model/nodeTree';
import type { Node } from '../model/nodeTypes';

export interface NodeListState {
  noteRows: NodeTreeRow[];
  noteRowsAll: NodeTreeRow[];
  noteParentById: Record<string, string | null>;
  trashRows: NodeTreeRow[];
  trashRowsAll: NodeTreeRow[];
  noteRowIds: string[];
  trashRowIds: string[];
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

export function useNodeListState(
  activeNodeId: string | null,
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  selectedTrashNodeId: string | null,
  collapsedNoteNodeIds: ReadonlySet<string>,
  collapsedTrashNodeIds: ReadonlySet<string>
): NodeListState {
  const trashedNodeIds = useWorkspaceStore((state) => state.trashedNodeIds);
  const visibleNodeOrder = useMemo(
    () => nodeOrder.filter((id) => !trashedNodeIds.includes(id)),
    [nodeOrder, trashedNodeIds]
  );
  const trashedNodeOrder = useMemo(
    () => nodeOrder.filter((id) => trashedNodeIds.includes(id)),
    [nodeOrder, trashedNodeIds]
  );
  const noteTree = useMemo(
    () => buildNodeTree(visibleNodeOrder, nodesById),
    [visibleNodeOrder, nodesById]
  );
  const trashTree = useMemo(
    () => buildNodeTree(trashedNodeOrder, nodesById),
    [trashedNodeOrder, nodesById]
  );
  const noteRows = useMemo(
    () => buildVisibleNodeTreeRows(noteTree.rows, collapsedNoteNodeIds),
    [noteTree.rows, collapsedNoteNodeIds]
  );
  const trashRows = useMemo(
    () => buildVisibleNodeTreeRows(trashTree.rows, collapsedTrashNodeIds),
    [trashTree.rows, collapsedTrashNodeIds]
  );
  const selectionState = useNodeListSelection(
    activeNodeId,
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
    noteRowIds: noteRows.map((row) => row.node.id),
    trashRowIds: trashRows.map((row) => row.node.id),
    ...selectionState
  };
}

function useNodeListSelection(
  activeNodeId: string | null,
  nodesById: Record<string, Node>,
  selectedTrashNodeId: string | null,
  trashedNodeIds: string[]
) {
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(
    activeNodeId ? [activeNodeId] : []
  );
  const [selectionAnchorNodeId, setSelectionAnchorNodeId] = useState<string | null>(activeNodeId);

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

  return { selectedNodeIds, setSelectedNodeIds, selectionAnchorNodeId, setSelectionAnchorNodeId };
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

interface CollapsedNodeState {
  collapsedNoteNodeIds: ReadonlySet<string>;
  collapsedTrashNodeIds: ReadonlySet<string>;
  setCollapsedNoteNodeIdList: Dispatch<SetStateAction<string[]>>;
  setCollapsedTrashNodeIdList: Dispatch<SetStateAction<string[]>>;
}

export function useCollapsedNodeState(): CollapsedNodeState {
  const [collapsedNoteNodeIdList, setCollapsedNoteNodeIdList] = useState<string[]>([]);
  const [collapsedTrashNodeIdList, setCollapsedTrashNodeIdList] = useState<string[]>([]);
  const collapsedNoteNodeIds = useMemo(
    () => new Set(collapsedNoteNodeIdList),
    [collapsedNoteNodeIdList]
  );
  const collapsedTrashNodeIds = useMemo(
    () => new Set(collapsedTrashNodeIdList),
    [collapsedTrashNodeIdList]
  );

  return {
    collapsedNoteNodeIds,
    collapsedTrashNodeIds,
    setCollapsedNoteNodeIdList,
    setCollapsedTrashNodeIdList
  };
}

export function useNodeSelectionHandler({
  activeNodeId,
  onSelectNode,
  onSelectTrashNode,
  selectedTrashNodeId,
  state,
  trashedNodeIds
}: {
  activeNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  selectedTrashNodeId: string | null;
  state: NodeListState;
  trashedNodeIds: string[];
}) {
  return (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    const isTrashNode = trashedNodeIds.includes(nodeId);
    const scopeIds = isTrashNode ? state.trashRowIds : state.noteRowIds;
    const scoped = state.selectedNodeIds.filter((id) =>
      isTrashNode ? trashedNodeIds.includes(id) : !trashedNodeIds.includes(id)
    );
    const notify = isTrashNode ? onSelectTrashNode : onSelectNode;
    const fallbackAnchor = isTrashNode ? (selectedTrashNodeId ?? nodeId) : (activeNodeId ?? nodeId);
    if (event.shiftKey) {
      state.setSelectedNodeIds(
        collectRangeNodeIds(scopeIds, state.selectionAnchorNodeId ?? fallbackAnchor, nodeId)
      );
      notify(nodeId);
      return;
    }
    if (event.metaKey || event.ctrlKey) {
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
  };
}
