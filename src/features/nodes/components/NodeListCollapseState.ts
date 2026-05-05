import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';

import type { NodeTreeRow } from '../model/nodeTree';
import {
  buildDefaultCollapsedNodeIds,
  collectAutoExpandedNodeIds
} from '../model/nodeTreeAutoCollapse';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import {
  loadCollapsedTrashNodeIds,
  loadManualCollapsedNoteNodeIds,
  loadManualExpandedNoteNodeIds,
  saveCollapsedTrashNodeIds,
  saveManualCollapsedNoteNodeIds,
  saveManualExpandedNoteNodeIds
} from './nodeListCollapseSettings';

export interface CollapsedNodeState {
  hasCollapsedNotes: boolean;
  hasCollapsibleNotes: boolean;
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
  const [collapsedTrashNodeIdList, setCollapsedTrashNodeIdList] = useState<string[]>(() => loadCollapsedTrashNodeIds());
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
  useEffect(() => {
    saveCollapsedTrashNodeIds(collapsedTrashNodeIdList);
  }, [collapsedTrashNodeIdList]);

  return {
    hasCollapsedNotes: noteState.hasCollapsedNotes,
    hasCollapsibleNotes: noteState.hasCollapsibleNotes,
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
  const noteCollapsibleNodeIds = useNoteCollapsibleNodeIds(noteRowsAll);
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
  const autoExpandedNoteNodeIds = useMemo(
    () =>
      collectAutoExpandedNodeIds({
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
        defaultCollapsedNoteNodeIds,
        manualCollapsedNoteNodeIdList,
        manualExpandedNoteNodeIdList,
        autoExpandedNoteNodeIds
      ),
    [
      autoExpandedNoteNodeIds,
      defaultCollapsedNoteNodeIds,
      manualCollapsedNoteNodeIdList,
      manualExpandedNoteNodeIdList
    ]
  );

  return {
    collapseAllNotes,
    hasCollapsibleNotes: noteCollapsibleNodeIds.size > 0,
    collapsedNoteNodeIds,
    expandAllNotes,
    hasCollapsedNotes: checkHasCollapsedNotes(noteCollapsibleNodeIds, collapsedNoteNodeIds),
    setManualCollapsedNoteNodeIdList,
    setManualExpandedNoteNodeIdList
  };
}

function useNoteCollapsibleNodeIds(noteRowsAll: NodeTreeRow[]) {
  return useMemo(
    () => new Set(noteRowsAll.filter((row) => row.hasChildren).map((row) => row.node.id)),
    [noteRowsAll]
  );
}

function useNoteManualCollapseState(noteCollapsibleNodeIds: ReadonlySet<string>) {
  const [manualCollapsedNoteNodeIdList, setManualCollapsedNoteNodeIdList] = useState<string[]>(
    () => loadManualCollapsedNoteNodeIds()
  );
  const [manualExpandedNoteNodeIdList, setManualExpandedNoteNodeIdList] = useState<string[]>(
    () => loadManualExpandedNoteNodeIds()
  );

  useEffect(() => {
    setManualCollapsedNoteNodeIdList((prev) => prev.filter((id) => noteCollapsibleNodeIds.has(id)));
    setManualExpandedNoteNodeIdList((prev) => prev.filter((id) => noteCollapsibleNodeIds.has(id)));
  }, [noteCollapsibleNodeIds]);

  useEffect(() => {
    saveManualCollapsedNoteNodeIds(manualCollapsedNoteNodeIdList);
  }, [manualCollapsedNoteNodeIdList]);

  useEffect(() => {
    saveManualExpandedNoteNodeIds(manualExpandedNoteNodeIdList);
  }, [manualExpandedNoteNodeIdList]);

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

function checkHasCollapsedNotes(
  noteCollapsibleNodeIds: ReadonlySet<string>,
  collapsedNoteNodeIds: ReadonlySet<string>
) {
  return (
    noteCollapsibleNodeIds.size > 0 &&
    [...noteCollapsibleNodeIds].some((nodeId) => collapsedNoteNodeIds.has(nodeId))
  );
}

function mergeCollapsedNodeIds(
  autoCollapsedNodeIds: ReadonlySet<string>,
  manualCollapsedNodeIdList: string[],
  manualExpandedNodeIdList: string[],
  autoExpandedNodeIds: ReadonlySet<string>
) {
  const next = new Set(autoCollapsedNodeIds);
  for (const nodeId of autoExpandedNodeIds) {
    next.delete(nodeId);
  }
  for (const nodeId of manualCollapsedNodeIdList) {
    next.add(nodeId);
  }
  for (const nodeId of manualExpandedNodeIdList) {
    next.delete(nodeId);
  }
  return next;
}
