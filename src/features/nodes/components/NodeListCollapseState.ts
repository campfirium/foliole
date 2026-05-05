import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';

import type { NodeTreeRow } from '../model/nodeTree';
import {
  buildDefaultCollapsedNodeIds,
  collectAutoExpandedNodeIds
} from '../model/nodeTreeAutoCollapse';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

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
  nodesById: WorkspaceListNodesById;
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
  const noteState = useNoteCollapsedState({
    activeNodeId,
    nodesById,
    noteParentById,
    noteRowsAll
  });
  const collapsedTrashNodeIds = useMemo(
    () => new Set(collapsedTrashNodeIdList),
    [collapsedTrashNodeIdList]
  );
  usePruneTrashCollapseState(trashRowsAll, setCollapsedTrashNodeIdList);

  return {
    collapsedNoteNodeIds: noteState.collapsedNoteNodeIds,
    collapsedTrashNodeIds,
    setCollapsedTrashNodeIdList,
    toggleNoteCollapse: (nodeId: string) =>
      toggleManualCollapseNode(
        nodeId,
        noteState.collapsedNoteNodeIds,
        noteState.setManualCollapsedNoteNodeIdList,
        noteState.setManualExpandedNoteNodeIdList
      ),
    collapseAllNotes: noteState.collapseAllNotes,
    expandAllNotes: noteState.expandAllNotes
  };
}

function useNoteCollapsedState({
  activeNodeId,
  nodesById,
  noteParentById,
  noteRowsAll
}: Omit<UseCollapsedNodeStateInput, 'trashRowsAll'>) {
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
  } = useNoteManualCollapseState(noteCollapsibleNodeIds);
  const defaultCollapsedNoteNodeIds = useMemo(
    () =>
      buildDefaultCollapsedNodeIds({
        nodesById,
        rows: noteRowsAll
      }),
    [nodesById, noteRowsAll]
  );
  useAutoExpandActiveNodePath(
    activeNodeId,
    nodesById,
    noteParentById,
    noteRowsAll,
    setManualCollapsedNoteNodeIdList,
    setManualExpandedNoteNodeIdList
  );
  const collapsedNoteNodeIds = useMemo(
    () =>
      mergeCollapsedNodeIds(
        defaultCollapsedNoteNodeIds,
        manualCollapsedNoteNodeIdList,
        manualExpandedNoteNodeIdList
      ),
    [defaultCollapsedNoteNodeIds, manualCollapsedNoteNodeIdList, manualExpandedNoteNodeIdList]
  );

  return {
    collapseAllNotes,
    collapsedNoteNodeIds,
    expandAllNotes,
    setManualCollapsedNoteNodeIdList,
    setManualExpandedNoteNodeIdList
  };
}

function useNoteManualCollapseState(noteCollapsibleNodeIds: ReadonlySet<string>) {
  const [manualCollapsedNoteNodeIdList, setManualCollapsedNoteNodeIdList] = useState<string[]>([]);
  const [manualExpandedNoteNodeIdList, setManualExpandedNoteNodeIdList] = useState<string[]>([]);

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

function useAutoExpandActiveNodePath(
  activeNodeId: string | null,
  nodesById: WorkspaceListNodesById,
  noteParentById: Record<string, string | null>,
  noteRowsAll: NodeTreeRow[],
  setManualCollapsedNoteNodeIdList: Dispatch<SetStateAction<string[]>>,
  setManualExpandedNoteNodeIdList: Dispatch<SetStateAction<string[]>>
) {
  const autoExpandedNodeIds = useMemo(
    () =>
      collectAutoExpandedNodeIds({
        activeNodeId,
        nodesById,
        parentById: noteParentById,
        rows: noteRowsAll
      }),
    [activeNodeId, nodesById, noteParentById, noteRowsAll]
  );

  useEffect(() => {
    if (autoExpandedNodeIds.size === 0) {
      return;
    }

    setManualCollapsedNoteNodeIdList((prev) =>
      prev.filter((nodeId) => !autoExpandedNodeIds.has(nodeId))
    );
    setManualExpandedNoteNodeIdList((prev) => appendUniqueList(prev, autoExpandedNodeIds));
  }, [autoExpandedNodeIds, setManualCollapsedNoteNodeIdList, setManualExpandedNoteNodeIdList]);
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

function appendUniqueList(values: string[], nodeIds: ReadonlySet<string>) {
  let next = values;
  for (const nodeId of nodeIds) {
    next = appendUnique(next, nodeId);
  }
  return next;
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
