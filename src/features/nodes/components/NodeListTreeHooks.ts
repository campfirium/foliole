import {
  useEffect,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction
} from 'react';

import { collectNodeAncestorIds, type NodeTreeRow } from '../model/nodeTree';

type MenuMode = 'notes' | 'trash' | null;

export interface NodeListContextMenuController {
  closeContextMenu: () => void;
  contextMenuMode: MenuMode;
  getContextTargets: () => string[];
  menuPosition: { left: number; top: number } | null;
  openContextMenu: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
}

export function useNodeListContextMenu(
  selectedNodeIds: string[],
  trashedNodeIds: string[]
): NodeListContextMenuController {
  const [contextNodeId, setContextNodeId] = useState<string | null>(null);
  const [contextMenuMode, setContextMenuMode] = useState<MenuMode>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);

  const closeContextMenu = () => {
    setContextNodeId(null);
    setContextMenuMode(null);
    setMenuPosition(null);
  };

  const openContextMenu = (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setContextNodeId(nodeId);
    setContextMenuMode(trashedNodeIds.includes(nodeId) ? 'trash' : 'notes');
    setMenuPosition({
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - 72))
    });
  };

  const getContextTargets = () => {
    if (!contextNodeId) return [];
    const inTrashMenu = contextMenuMode === 'trash';
    const scoped = selectedNodeIds.filter((id) =>
      inTrashMenu ? trashedNodeIds.includes(id) : !trashedNodeIds.includes(id)
    );
    return scoped.includes(contextNodeId) ? scoped : [contextNodeId];
  };

  return { closeContextMenu, contextMenuMode, getContextTargets, menuPosition, openContextMenu };
}

export interface NodeListCollapseController {
  collapseAllNotes: () => void;
  expandAllNotes: () => void;
  toggleCollapse: (nodeId: string) => void;
}

interface UseNodeCollapseControlsInput {
  activeNodeId: string | null;
  noteParentById: Record<string, string | null>;
  noteRowsAll: NodeTreeRow[];
  setCollapsedNoteNodeIdList: Dispatch<SetStateAction<string[]>>;
  setCollapsedTrashNodeIdList: Dispatch<SetStateAction<string[]>>;
  trashRowsAll: NodeTreeRow[];
  trashedNodeIds: string[];
}

export function useNodeCollapseControls({
  activeNodeId,
  noteParentById,
  noteRowsAll,
  setCollapsedNoteNodeIdList,
  setCollapsedTrashNodeIdList,
  trashRowsAll,
  trashedNodeIds
}: UseNodeCollapseControlsInput): NodeListCollapseController {
  useEffect(() => {
    const noteIds = new Set(noteRowsAll.filter((row) => row.hasChildren).map((row) => row.node.id));
    const trashIds = new Set(
      trashRowsAll.filter((row) => row.hasChildren).map((row) => row.node.id)
    );
    setCollapsedNoteNodeIdList((prev) => prev.filter((id) => noteIds.has(id)));
    setCollapsedTrashNodeIdList((prev) => prev.filter((id) => trashIds.has(id)));
  }, [noteRowsAll, setCollapsedNoteNodeIdList, setCollapsedTrashNodeIdList, trashRowsAll]);

  useEffect(() => {
    if (!activeNodeId || trashedNodeIds.includes(activeNodeId)) return;
    const ancestorIds = new Set(collectNodeAncestorIds(activeNodeId, noteParentById));
    if (ancestorIds.size === 0) return;
    setCollapsedNoteNodeIdList((prev) => {
      const next = prev.filter((id) => !ancestorIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [activeNodeId, noteParentById, setCollapsedNoteNodeIdList, trashedNodeIds]);

  const toggleCollapse = (nodeId: string) => {
    const setCollapsed = trashedNodeIds.includes(nodeId)
      ? setCollapsedTrashNodeIdList
      : setCollapsedNoteNodeIdList;
    setCollapsed((prev) =>
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
    );
  };

  const collapseAllNotes = () =>
    setCollapsedNoteNodeIdList(
      noteRowsAll.filter((row) => row.hasChildren).map((row) => row.node.id)
    );

  return { collapseAllNotes, expandAllNotes: () => setCollapsedNoteNodeIdList([]), toggleCollapse };
}
