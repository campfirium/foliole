import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';

import { AppButton, AppPanel, EmptyState } from '../../../shared/ui';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { buildNodeTreeRows } from '../model/nodeTree';
import type { Node } from '../model/nodeTypes';

import { NodeListContextMenu } from './NodeListContextMenu';
import { NodeTrashSection } from './NodeTrashSection';
import { NodeTreeRow } from './NodeTreeRow';

interface NodeListTreeProps {
  activeNodeId: string | null;
  isTrashViewOpen: boolean;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
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
  onOpenTrashView,
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

  const handleNotesHeaderClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenNotesView();
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
      <AppPanel
        ariaLabel="Node list panel"
        actions={
          <div className="inline-flex gap-2">
            <AppButton aria-label="New" onClick={handleCreateRootNode} size="sm" variant="subtle">
              New
            </AppButton>
          </div>
        }
        as="aside"
        bodyClassName="flex min-h-0 flex-1 flex-col gap-0 px-4 py-0"
        className="min-h-0"
        onHeaderClick={onOpenNotesView}
        scrollBody
        title={
          <h2 className="m-0">
            <button
              aria-label="Nodes"
              aria-pressed={!isTrashViewOpen}
              className="min-h-7 w-full border-0 bg-transparent p-0 text-left text-xs font-bold uppercase tracking-[0.08em] text-stone-500 hover:text-foreground aria-[pressed=true]:text-foreground"
              onClick={handleNotesHeaderClick}
              type="button"
            >
              Nodes
            </button>
          </h2>
        }
      >
        <section
          aria-hidden={isTrashViewOpen}
          className="flex max-h-[120dvh] flex-1 flex-col gap-2 overflow-hidden pt-2 transition-all duration-200 data-[collapsed=true]:pointer-events-none data-[collapsed=true]:max-h-0 data-[collapsed=true]:translate-y-[-4px] data-[collapsed=true]:pt-0 data-[collapsed=true]:opacity-0"
          data-collapsed={isTrashViewOpen}
        >
          {noteRows.length === 0 ? (
            <EmptyState description="Create or import a node to start editing." title="No nodes" />
          ) : (
            noteRows.map((row) => (
              <NodeTreeRow
                depth={row.depth}
                isActive={activeNodeId === row.node.id}
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

        <NodeTrashSection
          isOpen={isTrashViewOpen}
          onOpen={onOpenTrashView}
          onContextMenu={openContextMenu}
          onEmptyTrash={handleEmptyTrash}
          onSelect={handleSelectNode}
          rows={trashRows}
          selectedNodeIds={selectedNodeIds}
        />
      </AppPanel>
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
