import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import type { NodeTreeRow } from '../model/nodeTree';
import { buildAutoCollapsedNodeIds, resolveNodeListFocusContextId } from '../model/nodeTreeAutoCollapse';
import type { Node } from '../model/nodeTypes';

export interface CollapsedNodeState {
  collapsedNoteNodeIds: ReadonlySet<string>;
  collapsedTrashNodeIds: ReadonlySet<string>;
  setCollapsedTrashNodeIdList: Dispatch<SetStateAction<string[]>>;
  toggleNoteCollapse: (nodeId: string) => void;
  collapseAllNotes: () => void;
  expandAllNotes: () => void;
}

interface UseCollapsedNodeStateInput {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  noteParentById: Record<string, string | null>;
  noteRowsAll: NodeTreeRow[];
  trashRowsAll: NodeTreeRow[];
}

export function useCollapsedNodeState({
  activeNodeId,
  nodesById,
  noteParentById,
  noteRowsAll,
  trashRowsAll
}: UseCollapsedNodeStateInput): CollapsedNodeState {
  const [collapsedTrashNodeIdList, setCollapsedTrashNodeIdList] = useState<string[]>([]);
  const focusContextId = resolveNodeListFocusContextId(activeNodeId, nodesById, noteParentById);
  const noteCollapsibleNodeIds = useMemo(
    () => new Set(noteRowsAll.filter((row) => row.hasChildren).map((row) => row.node.id)),
    [noteRowsAll]
  );
  const {
    collapseAllNotes,
    expandAllNotes,
    manualCollapsedNoteNodeIdList,
    manualExpandedNoteNodeIdList,
    setManualCollapsedNoteNodeIdList,
    setManualExpandedNoteNodeIdList
  } = useNoteManualCollapseState(focusContextId, noteCollapsibleNodeIds);
  const autoCollapsedNoteNodeIds = useMemo(
    () =>
      buildAutoCollapsedNodeIds({
        activeNodeId,
        nodesById,
        parentById: noteParentById,
        rows: noteRowsAll
      }),
    [activeNodeId, nodesById, noteParentById, noteRowsAll]
  );
  const collapsedNoteNodeIds = useMemo(
    () =>
      mergeCollapsedNodeIds(
        autoCollapsedNoteNodeIds,
        manualCollapsedNoteNodeIdList,
        manualExpandedNoteNodeIdList
      ),
    [autoCollapsedNoteNodeIds, manualCollapsedNoteNodeIdList, manualExpandedNoteNodeIdList]
  );
  const collapsedTrashNodeIds = useMemo(
    () => new Set(collapsedTrashNodeIdList),
    [collapsedTrashNodeIdList]
  );
  usePruneTrashCollapseState(trashRowsAll, setCollapsedTrashNodeIdList);

  return {
    collapsedNoteNodeIds,
    collapsedTrashNodeIds,
    setCollapsedTrashNodeIdList,
    toggleNoteCollapse: (nodeId: string) =>
      toggleManualCollapseNode(
        nodeId,
        collapsedNoteNodeIds,
        setManualCollapsedNoteNodeIdList,
        setManualExpandedNoteNodeIdList
      ),
    collapseAllNotes,
    expandAllNotes
  };
}

function useNoteManualCollapseState(
  focusContextId: string | null,
  noteCollapsibleNodeIds: ReadonlySet<string>
) {
  const [manualCollapsedNoteNodeIdList, setManualCollapsedNoteNodeIdList] = useState<string[]>([]);
  const [manualExpandedNoteNodeIdList, setManualExpandedNoteNodeIdList] = useState<string[]>([]);
  const previousFocusContextIdRef = useRef<string | null>(focusContextId);

  useEffect(() => {
    if (previousFocusContextIdRef.current === focusContextId) {
      return;
    }

    previousFocusContextIdRef.current = focusContextId;
    setManualCollapsedNoteNodeIdList([]);
    setManualExpandedNoteNodeIdList([]);
  }, [focusContextId]);

  useEffect(() => {
    setManualCollapsedNoteNodeIdList((prev) => prev.filter((id) => noteCollapsibleNodeIds.has(id)));
    setManualExpandedNoteNodeIdList((prev) => prev.filter((id) => noteCollapsibleNodeIds.has(id)));
  }, [noteCollapsibleNodeIds]);

  return {
    collapseAllNotes: () =>
      setManualCollapseState(
        setManualCollapsedNoteNodeIdList,
        setManualExpandedNoteNodeIdList,
        [...noteCollapsibleNodeIds],
        'collapsed'
      ),
    expandAllNotes: () =>
      setManualCollapseState(
        setManualCollapsedNoteNodeIdList,
        setManualExpandedNoteNodeIdList,
        [...noteCollapsibleNodeIds],
        'expanded'
      ),
    manualCollapsedNoteNodeIdList,
    manualExpandedNoteNodeIdList,
    setManualCollapsedNoteNodeIdList,
    setManualExpandedNoteNodeIdList
  };
}

function usePruneTrashCollapseState(
  trashRowsAll: NodeTreeRow[],
  setCollapsedTrashNodeIdList: Dispatch<SetStateAction<string[]>>
) {
  useEffect(() => {
    const trashCollapsibleNodeIds = new Set(
      trashRowsAll.filter((row) => row.hasChildren).map((row) => row.node.id)
    );
    setCollapsedTrashNodeIdList((prev) => prev.filter((id) => trashCollapsibleNodeIds.has(id)));
  }, [setCollapsedTrashNodeIdList, trashRowsAll]);
}

function appendUnique(values: string[], nodeId: string) {
  return values.includes(nodeId) ? values : [...values, nodeId];
}

function toggleManualCollapseNode(
  nodeId: string,
  collapsedNoteNodeIds: ReadonlySet<string>,
  setManualCollapsedNoteNodeIdList: Dispatch<SetStateAction<string[]>>,
  setManualExpandedNoteNodeIdList: Dispatch<SetStateAction<string[]>>
) {
  const isCollapsed = collapsedNoteNodeIds.has(nodeId);
  setManualCollapsedNoteNodeIdList((prev) =>
    isCollapsed ? prev.filter((id) => id !== nodeId) : appendUnique(prev, nodeId)
  );
  setManualExpandedNoteNodeIdList((prev) =>
    isCollapsed ? appendUnique(prev, nodeId) : prev.filter((id) => id !== nodeId)
  );
}

function setManualCollapseState(
  setManualCollapsedNoteNodeIdList: Dispatch<SetStateAction<string[]>>,
  setManualExpandedNoteNodeIdList: Dispatch<SetStateAction<string[]>>,
  nodeIds: string[],
  mode: 'collapsed' | 'expanded'
) {
  setManualCollapsedNoteNodeIdList(mode === 'collapsed' ? nodeIds : []);
  setManualExpandedNoteNodeIdList(mode === 'expanded' ? nodeIds : []);
}

function mergeCollapsedNodeIds(
  autoCollapsedNodeIds: ReadonlySet<string>,
  manualCollapsedNodeIdList: string[],
  manualExpandedNodeIdList: string[]
) {
  const next = new Set(autoCollapsedNodeIds);
  for (const nodeId of manualCollapsedNodeIdList) {
    next.add(nodeId);
  }
  for (const nodeId of manualExpandedNodeIdList) {
    next.delete(nodeId);
  }
  return next;
}
