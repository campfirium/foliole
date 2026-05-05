import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';

import { AppButton, AppEmptyState, AppIconButton } from '../../../shared/ui';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { buildNodeTreeRows } from '../model/nodeTree';
import type { Node } from '../model/nodeTypes';

import { NodeListContextMenu } from './NodeListContextMenu';
import { NodeTreeRow } from './NodeTreeRow';

interface NodeListTreeProps {
  activeNodeId: string | null;
  isTrashViewOpen: boolean;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onOpenNotesView: () => void;
  onSelectNode: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  selectedTrashNodeId: string | null;
}

type MenuMode = 'notes' | 'trash' | null;
export function NodeListTree({
  activeNodeId,
  isTrashViewOpen,
  nodeOrder,
  nodesById,
  onOpenNotesView,
  onSelectNode,
  onSelectTrashNode,
  selectedTrashNodeId
}: NodeListTreeProps) {
  const createRootNode = useWorkspaceStore((state) => state.createRootNode);
  const deleteNode = useWorkspaceStore((state) => state.deleteNode);
  const deleteNodePermanently = useWorkspaceStore((state) => state.deleteNodePermanently);
  const restoreNode = useWorkspaceStore((state) => state.restoreNode);
  const trashedNodeIds = useWorkspaceStore((state) => state.trashedNodeIds);

  const visibleNodeOrder = nodeOrder.filter((id) => !trashedNodeIds.includes(id));
  const trashedNodeOrder = nodeOrder.filter((id) => trashedNodeIds.includes(id));
  const noteRows = buildNodeTreeRows(visibleNodeOrder, nodesById);
  const trashRows = buildNodeTreeRows(trashedNodeOrder, nodesById);
  const noteRowIds = noteRows.map((row) => row.node.id);
  const trashRowIds = trashRows.map((row) => row.node.id);
  const activeRows = isTrashViewOpen ? trashRows : noteRows;

  const [contextNodeId, setContextNodeId] = useState<string | null>(null);
  const [contextMenuMode, setContextMenuMode] = useState<MenuMode>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(activeNodeId ? [activeNodeId] : []);
  const [selectionAnchorNodeId, setSelectionAnchorNodeId] = useState<string | null>(activeNodeId);

  useEffect(() => {
    setSelectedNodeIds((prev) => prev.filter((id) => Boolean(nodesById[id])));
    setSelectionAnchorNodeId((prev) => (prev && nodesById[prev] ? prev : null));
  }, [nodesById]);

  useEffect(() => {
    if (!activeNodeId || trashedNodeIds.includes(activeNodeId)) {
      return;
    }
    setSelectedNodeIds((prev) => {
      const hasTrashSelection = prev.some((id) => trashedNodeIds.includes(id));
      if (hasTrashSelection) {
        return prev;
      }
      return prev.includes(activeNodeId) ? prev : [activeNodeId];
    });
    setSelectionAnchorNodeId((prev) => prev ?? activeNodeId);
  }, [activeNodeId, trashedNodeIds]);

  useEffect(() => {
    if (!isTrashViewOpen) {
      return;
    }
    if (selectedTrashNodeId && trashedNodeIds.includes(selectedTrashNodeId)) {
      setSelectedNodeIds((prev) => (prev.length === 0 ? [selectedTrashNodeId] : prev));
      setSelectionAnchorNodeId((prev) => prev ?? selectedTrashNodeId);
    }
  }, [isTrashViewOpen, selectedTrashNodeId, trashedNodeIds]);

  const closeContextMenu = () => {
    setContextNodeId(null);
    setContextMenuMode(null);
    setMenuPosition(null);
  };

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, []);

  const openContextMenu = (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const isTrashNode = trashedNodeIds.includes(nodeId);
    setContextNodeId(nodeId);
    setContextMenuMode(isTrashNode ? 'trash' : 'notes');
    setMenuPosition({
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - 72))
    });
  };

  const getContextTargets = () => {
    if (!contextNodeId) {
      return [];
    }
    const inTrashMenu = contextMenuMode === 'trash';
    const scopedSelection = selectedNodeIds.filter((id) => (inTrashMenu ? trashedNodeIds.includes(id) : !trashedNodeIds.includes(id)));
    return scopedSelection.includes(contextNodeId) ? scopedSelection : [contextNodeId];
  };

  const handleDeleteNode = () => {
    const orderedTargets = [...getContextTargets()].sort((a, b) => noteRowIds.indexOf(a) - noteRowIds.indexOf(b));
    for (const nodeId of orderedTargets) {
      deleteNode(nodeId);
    }
    closeContextMenu();
  };

  const handleRestoreNode = () => {
    for (const nodeId of getContextTargets()) {
      restoreNode(nodeId);
    }
    closeContextMenu();
  };

  const handleDeleteNodePermanently = () => {
    for (const nodeId of getContextTargets()) {
      deleteNodePermanently(nodeId);
    }
    closeContextMenu();
  };

  const handleEmptyTrash = () => {
    for (const nodeId of trashedNodeOrder) {
      deleteNodePermanently(nodeId);
    }
    closeContextMenu();
  };

  const handleCreateRootNode = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    createRootNode('');
  };

  const handleSelectNode = (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    const isTrashNode = trashedNodeIds.includes(nodeId);
    const scopeNodeIds = isTrashNode ? trashRowIds : noteRowIds;
    const scopedSelection = selectedNodeIds.filter((id) => (isTrashNode ? trashedNodeIds.includes(id) : !trashedNodeIds.includes(id)));
    const isRangeSelection = event.shiftKey;
    const isToggleSelection = event.metaKey || event.ctrlKey;
    const notify = isTrashNode ? onSelectTrashNode : onSelectNode;
    const fallbackAnchor = isTrashNode ? selectedTrashNodeId ?? nodeId : activeNodeId ?? nodeId;

    if (isRangeSelection) {
      const anchorNodeId = selectionAnchorNodeId ?? fallbackAnchor;
      const rangeNodeIds = collectRangeNodeIds(scopeNodeIds, anchorNodeId, nodeId);
      setSelectedNodeIds(rangeNodeIds);
      notify(nodeId);
      return;
    }

    if (isToggleSelection) {
      const isSelected = scopedSelection.includes(nodeId);
      if (isSelected && scopedSelection.length > 1) {
        const nextSelectedNodeIds = scopedSelection.filter((id) => id !== nodeId);
        setSelectedNodeIds(nextSelectedNodeIds);
        notify(nextSelectedNodeIds[nextSelectedNodeIds.length - 1] ?? nodeId);
        return;
      }
      if (isSelected) {
        return;
      }
      setSelectedNodeIds([...scopedSelection, nodeId]);
      setSelectionAnchorNodeId(nodeId);
      notify(nodeId);
      return;
    }

    setSelectedNodeIds([nodeId]);
    setSelectionAnchorNodeId(nodeId);
    notify(nodeId);
  };

  return (
    <>
      <aside aria-label="Node list panel" className="flex min-h-0 flex-col bg-bg-panel text-foreground">
        <header className="flex min-h-[40px] items-center justify-end px-3">
          <h2 className="sr-only">Nodes</h2>
          <button className="sr-only" onClick={onOpenNotesView} type="button">
            Nodes
          </button>
          {isTrashViewOpen ? (
            <>
              <button aria-label="New" className="sr-only" onClick={handleCreateRootNode} type="button">
                New
              </button>
              <AppButton
                aria-label="Empty"
                className="text-foreground/70 hover:text-foreground"
                disabled={trashRows.length === 0}
                onClick={handleEmptyTrash}
                size="sm"
                variant="subtle"
              >
                Empty
              </AppButton>
            </>
          ) : (
            <AppIconButton
              aria-label="New"
              className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
              icon={<NewNoteIcon />}
              label="New"
              onClick={handleCreateRootNode}
            />
          )}
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-2">
          <section aria-label={isTrashViewOpen ? 'Trash section' : undefined} className="flex flex-1 flex-col gap-2">
            {activeRows.length === 0 ? (
              isTrashViewOpen ? (
                <AppEmptyState description="Deleted nodes will appear here." title="Trash is empty" />
              ) : (
                <AppEmptyState description="Create or import a node to start editing." title="No nodes" />
              )
            ) : (
              activeRows.map((row) => (
                <NodeTreeRow
                  depth={row.depth}
                  isActive={(isTrashViewOpen ? selectedTrashNodeId : activeNodeId) === row.node.id}
                  isSelected={selectedNodeIds.includes(row.node.id)}
                  key={row.node.id}
                  label={row.node.title}
                  nodeId={row.node.id}
                  onContextMenu={openContextMenu}
                  onSelect={handleSelectNode}
                  showBranch={row.depth > 0 || row.hasChildren}
                />
              ))
            )}
          </section>
        </div>
      </aside>
      {menuPosition ? (
        <NodeListContextMenu
          isTrashMenu={contextMenuMode === 'trash'}
          left={menuPosition.left}
          onClose={closeContextMenu}
          onDeleteNode={handleDeleteNode}
          onDeleteNodePermanently={handleDeleteNodePermanently}
          onRestoreNode={handleRestoreNode}
          top={menuPosition.top}
        />
      ) : null}
    </>
  );
}

function NewNoteIcon() {
  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 16 16">
      <path d="M3 2.5h6.8L13 5.7v7.8H3z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
      <path d="M9.8 2.5v3.2H13" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
      <path d="m6.2 10.8 2.9-2.9 1.2 1.2-2.9 2.9-1.8.6z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.1" />
    </svg>
  );
}

function collectRangeNodeIds(nodeIds: string[], anchorNodeId: string, targetNodeId: string) {
  const anchorIndex = nodeIds.indexOf(anchorNodeId);
  const targetIndex = nodeIds.indexOf(targetNodeId);
  if (anchorIndex < 0 || targetIndex < 0) {
    return [targetNodeId];
  }
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return nodeIds.slice(start, end + 1);
}
