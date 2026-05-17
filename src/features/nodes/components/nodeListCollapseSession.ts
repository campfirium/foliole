import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

type NodeIdListSetter = Dispatch<SetStateAction<string[]>>;

let sessionManualCollapsedNoteNodeIds: string[] = [];
let sessionManualExpandedNoteNodeIds: string[] = [];
let sessionCollapsedTrashNodeIds: string[] = [];

function saveSessionCollapsedTrashNodeIds(next: string[]) {
  sessionCollapsedTrashNodeIds = next;
}

function saveSessionManualCollapsedNoteNodeIds(next: string[]) {
  sessionManualCollapsedNoteNodeIds = next;
}

function saveSessionManualExpandedNoteNodeIds(next: string[]) {
  sessionManualExpandedNoteNodeIds = next;
}

export function resetNodeListCollapseSessionForTest() {
  sessionManualCollapsedNoteNodeIds = [];
  sessionManualExpandedNoteNodeIds = [];
  sessionCollapsedTrashNodeIds = [];
}

export function useSessionCollapsedTrashNodeIds(): [string[], NodeIdListSetter] {
  return useSessionBackedNodeIdList(
    () => sessionCollapsedTrashNodeIds,
    saveSessionCollapsedTrashNodeIds
  );
}

export function useSessionManualCollapsedNoteNodeIds(): [string[], NodeIdListSetter] {
  return useSessionBackedNodeIdList(
    () => sessionManualCollapsedNoteNodeIds,
    saveSessionManualCollapsedNoteNodeIds
  );
}

export function useSessionManualExpandedNoteNodeIds(): [string[], NodeIdListSetter] {
  return useSessionBackedNodeIdList(
    () => sessionManualExpandedNoteNodeIds,
    saveSessionManualExpandedNoteNodeIds
  );
}

function useSessionBackedNodeIdList(
  getInitialList: () => string[],
  saveSessionList: (next: string[]) => void
): [string[], NodeIdListSetter] {
  const [nodeIdList, setNodeIdList] = useState<string[]>(getInitialList);
  const setSessionBackedNodeIdList = useCallback<NodeIdListSetter>((value) => {
    setNodeIdList((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      saveSessionList(next);
      return next;
    });
  }, [saveSessionList]);
  return [nodeIdList, setSessionBackedNodeIdList];
}
