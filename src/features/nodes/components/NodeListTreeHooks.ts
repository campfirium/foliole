import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction
} from 'react';

import { isCanonicalTrashedNodeId } from '../../../shared/workspaceCanonicalSelectors';
import type { NodeTreeRow } from '../model/nodeTree';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

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
  nodesById: WorkspaceListNodesById,
  selectedNodeIds: string[],
  trashedNodeIds: string[]
): NodeListContextMenuController {
  const [contextNodeId, setContextNodeId] = useState<string | null>(null);
  const [contextMenuMode, setContextMenuMode] = useState<MenuMode>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextNodeId(null);
    setContextMenuMode(null);
    setMenuPosition(null);
  }, []);

  const openContextMenu = useCallback((nodeId: string, event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    setContextNodeId(nodeId);
    setContextMenuMode(isCanonicalTrashedNodeId({ nodeOrder: [], nodesById, trashedNodeIds }, nodeId) ? 'trash' : 'notes');
    setMenuPosition(getMenuPosition(event));
  }, [nodesById, trashedNodeIds]);

  const openRootContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    setContextNodeId(null);
    setContextMenuMode('notes-root');
    setMenuPosition(getMenuPosition(event));
  }, []);

  const getContextTargets = useCallback(() => {
    if (!contextNodeId) return [];
    const inTrashMenu = contextMenuMode === 'trash';
    const scoped = selectedNodeIds.filter((id) =>
      inTrashMenu
        ? isCanonicalTrashedNodeId({ nodeOrder: [], nodesById, trashedNodeIds }, id)
        : !isCanonicalTrashedNodeId({ nodeOrder: [], nodesById, trashedNodeIds }, id)
    );
    return scoped.includes(contextNodeId) ? scoped : [contextNodeId];
  }, [contextMenuMode, contextNodeId, nodesById, selectedNodeIds, trashedNodeIds]);

  return { closeContextMenu, contextMenuMode, getContextTargets, menuPosition, openContextMenu, openRootContextMenu };
}

export interface NodeListCollapseController {
  collapseAllNotes: () => void;
  expandNoteCollapse: (nodeId: string) => void;
  hasCollapsibleNotes: boolean;
  expandAllNotes: () => void;
  hasCollapsedNotes: boolean;
  toggleCollapse: (nodeId: string) => void;
}

interface UseNodeCollapseControlsInput {
  collapseAllNotes: () => void;
  expandAllNotes: () => void;
  hasCollapsibleNotes: boolean;
  hasCollapsedNotes: boolean;
  expandNoteCollapse: (nodeId: string) => void;
  setCollapsedTrashNodeIdList: Dispatch<SetStateAction<string[]>>;
  toggleNoteCollapse: (nodeId: string) => void;
  nodesById: WorkspaceListNodesById;
  trashRowsAll: NodeTreeRow[];
  trashedNodeIds: string[];
}

export function useNodeCollapseControls({
  collapseAllNotes,
  expandNoteCollapse,
  expandAllNotes,
  hasCollapsibleNotes,
  hasCollapsedNotes,
  setCollapsedTrashNodeIdList,
  toggleNoteCollapse,
  nodesById,
  trashRowsAll,
  trashedNodeIds
}: UseNodeCollapseControlsInput): NodeListCollapseController {
  useEffect(() => {
    const trashIds = new Set(
      trashRowsAll.filter((row) => row.hasChildren).map((row) => row.node.id)
    );
    setCollapsedTrashNodeIdList((prev) => prev.filter((id) => trashIds.has(id)));
  }, [setCollapsedTrashNodeIdList, trashRowsAll]);

  const toggleCollapse = useCallback((nodeId: string) => {
    if (!isCanonicalTrashedNodeId({ nodeOrder: [], nodesById, trashedNodeIds }, nodeId)) {
      toggleNoteCollapse(nodeId);
      return;
    }

    setCollapsedTrashNodeIdList((prev) =>
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
    );
  }, [nodesById, setCollapsedTrashNodeIdList, toggleNoteCollapse, trashedNodeIds]);

  return { collapseAllNotes, expandAllNotes, expandNoteCollapse, hasCollapsibleNotes, hasCollapsedNotes, toggleCollapse };
}
