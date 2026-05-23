import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';

import type { NodeTreeRow } from '../model/nodeTree';
import { isHomeNode } from '../model/specialNodes';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import {
  mergeCollapsedNodeIds,
  removeForcedExpandedNodeIds
} from './nodeListCollapseMerge';
import {
  useSessionCollapsedTrashNodeIds,
  useSessionManualCollapsedNoteNodeIds,
  useSessionManualExpandedNoteNodeIds
} from './nodeListCollapseSession';
import {
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
  expandNoteCollapse: (nodeId: string) => void;
  toggleNoteCollapse: (nodeId: string) => void;
  collapseAllNotes: () => void;
  expandAllNotes: () => void;
}

interface UseCollapsedNodeStateInput {
  activeNodeId: string | null;
  forceExpandedNodeId?: string | null;
  nodesById: WorkspaceListNodesById;
  noteParentById: Record<string, string | null>;
  noteRowsAll: NodeTreeRow[];
  trashRowsAll: NodeTreeRow[];
}

export function useCollapsedNodeState({
  forceExpandedNodeId,
  noteParentById,
  noteRowsAll,
  trashRowsAll
}: UseCollapsedNodeStateInput): CollapsedNodeState {
  const [collapsedTrashNodeIdList, setCollapsedTrashNodeIdList] = useSessionCollapsedTrashNodeIds();
  const noteState = useNoteCollapsedState({ forceExpandedNodeId, noteParentById, noteRowsAll });
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
    expandNoteCollapse: (nodeId: string) =>
      noteState.noteCollapsibleNodeIds.has(nodeId)
        ? expandManualCollapseNode(
            nodeId,
            noteState.setManualCollapsedNoteNodeIdList,
            noteState.setManualExpandedNoteNodeIdList
          )
        : undefined,
    toggleNoteCollapse: (nodeId: string) =>
      noteState.noteCollapsibleNodeIds.has(nodeId)
        ? toggleManualCollapseNode(
            nodeId,
            noteState.collapsedNoteNodeIds,
            noteState.setManualCollapsedNoteNodeIdList,
            noteState.setManualExpandedNoteNodeIdList
          )
        : undefined,
    collapseAllNotes: noteState.collapseAllNotes,
    expandAllNotes: noteState.expandAllNotes
  };
}

function useNoteCollapsedState({
  forceExpandedNodeId,
  noteParentById,
  noteRowsAll
}: Pick<UseCollapsedNodeStateInput, 'forceExpandedNodeId' | 'noteParentById' | 'noteRowsAll'>) {
  const noteCollapsibleNodeIds = useNoteCollapsibleNodeIds(noteRowsAll);
  const {
    collapseAllNotes,
    expandAllNotes,
    manualCollapsedNoteNodeIdList,
    manualExpandedNoteNodeIdList,
    setManualCollapsedNoteNodeIdList,
    setManualExpandedNoteNodeIdList
  } = useNoteManualCollapseState(noteCollapsibleNodeIds);
  const collapsedNoteNodeIds = useMemo(
    () =>
      removeForcedExpandedNodeIds(
        mergeCollapsedNodeIds(
          noteCollapsibleNodeIds,
          manualCollapsedNoteNodeIdList,
          manualExpandedNoteNodeIdList
        ),
        noteParentById,
        forceExpandedNodeId
      ),
    [
      forceExpandedNodeId,
      noteCollapsibleNodeIds,
      noteParentById,
      manualCollapsedNoteNodeIdList,
      manualExpandedNoteNodeIdList
    ]
  );

  return {
    collapseAllNotes,
    hasCollapsibleNotes: noteCollapsibleNodeIds.size > 0,
    noteCollapsibleNodeIds,
    collapsedNoteNodeIds,
    expandAllNotes,
    hasCollapsedNotes: checkHasCollapsedNotes(noteCollapsibleNodeIds, collapsedNoteNodeIds),
    setManualCollapsedNoteNodeIdList,
    setManualExpandedNoteNodeIdList
  };
}

function useNoteCollapsibleNodeIds(noteRowsAll: NodeTreeRow[]) {
  return useMemo(
    () => new Set(noteRowsAll.filter((row) => row.hasChildren && !isHomeNode(row.node)).map((row) => row.node.id)),
    [noteRowsAll]
  );
}

function useNoteManualCollapseState(noteCollapsibleNodeIds: ReadonlySet<string>) {
  const [manualCollapsedNoteNodeIdList, setManualCollapsedNoteNodeIdList] = useSessionManualCollapsedNoteNodeIds();
  const [manualExpandedNoteNodeIdList, setManualExpandedNoteNodeIdList] = useSessionManualExpandedNoteNodeIds();

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

function expandManualCollapseNode(
  nodeId: string,
  setManualCollapsedNoteNodeIdList: Dispatch<SetStateAction<string[]>>,
  setManualExpandedNoteNodeIdList: Dispatch<SetStateAction<string[]>>
) {
  setManualCollapsedNoteNodeIdList((prev) => prev.filter((id) => id !== nodeId));
  setManualExpandedNoteNodeIdList((prev) => appendUnique(prev, nodeId));
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
