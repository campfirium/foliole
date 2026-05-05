import {
  useEffect,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction
} from 'react';

import type { NodeTreeRow } from '../model/nodeTree';

type MenuMode = 'notes' | 'trash' | 'notes-root' | null;

export interface NodeListContextMenuController {
  closeContextMenu: () => void;
  contextMenuMode: MenuMode;
  getContextTargets: () => string[];
  menuPosition: { left: number; top: number } | null;
  openContextMenu: (nodeId: string, event: ReactMouseEvent<HTMLElement>) => void;
  openRootContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
}

function getMenuPosition(event: ReactMouseEvent<HTMLElement>) {
  return {
    left: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)),
    top: Math.max(8, Math.min(event.clientY, window.innerHeight - 72))
  };
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

  const openContextMenu = (nodeId: string, event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    setContextNodeId(nodeId);
    setContextMenuMode(trashedNodeIds.includes(nodeId) ? 'trash' : 'notes');
    setMenuPosition(getMenuPosition(event));
  };

  const openRootContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    setContextNodeId(null);
    setContextMenuMode('notes-root');
    setMenuPosition(getMenuPosition(event));
  };

  const getContextTargets = () => {
    if (!contextNodeId) return [];
    const inTrashMenu = contextMenuMode === 'trash';
    const scoped = selectedNodeIds.filter((id) =>
      inTrashMenu ? trashedNodeIds.includes(id) : !trashedNodeIds.includes(id)
    );
    return scoped.includes(contextNodeId) ? scoped : [contextNodeId];
  };

  return { closeContextMenu, contextMenuMode, getContextTargets, menuPosition, openContextMenu, openRootContextMenu };
}

export interface NodeListCollapseController {
  collapseAllNotes: () => void;
  expandAllNotes: () => void;
  toggleCollapse: (nodeId: string) => void;
}

interface UseNodeCollapseControlsInput {
  collapseAllNotes: () => void;
  expandAllNotes: () => void;
  setCollapsedTrashNodeIdList: Dispatch<SetStateAction<string[]>>;
  toggleNoteCollapse: (nodeId: string) => void;
  trashRowsAll: NodeTreeRow[];
  trashedNodeIds: string[];
}

export function useNodeCollapseControls({
  collapseAllNotes,
  expandAllNotes,
  setCollapsedTrashNodeIdList,
  toggleNoteCollapse,
  trashRowsAll,
  trashedNodeIds
}: UseNodeCollapseControlsInput): NodeListCollapseController {
  useEffect(() => {
    const trashIds = new Set(
      trashRowsAll.filter((row) => row.hasChildren).map((row) => row.node.id)
    );
    setCollapsedTrashNodeIdList((prev) => prev.filter((id) => trashIds.has(id)));
  }, [setCollapsedTrashNodeIdList, trashRowsAll]);

  const toggleCollapse = (nodeId: string) => {
    if (!trashedNodeIds.includes(nodeId)) {
      toggleNoteCollapse(nodeId);
      return;
    }

    setCollapsedTrashNodeIdList((prev) =>
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
    );
  };

  return { collapseAllNotes, expandAllNotes, toggleCollapse };
}
