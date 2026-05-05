import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';

import { onWindowKeydown } from '../../../shared/platform/keyboard';
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

interface NodeListState {
  noteRows: ReturnType<typeof buildNodeTreeRows>;
  trashRows: ReturnType<typeof buildNodeTreeRows>;
  noteRowIds: string[];
  trashRowIds: string[];
  selectedNodeIds: string[];
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectionAnchorNodeId: string | null;
  setSelectionAnchorNodeId: React.Dispatch<React.SetStateAction<string | null>>;
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

function NewNoteIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 16 16">
      <path d="M3 2.5h6.8L13 5.7v7.8H3z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.05" />
      <path d="M9.8 2.5v3.2H13" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.05" />
      <path d="m6.2 10.8 2.9-2.9 1.2 1.2-2.9 2.9-1.8.6z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.05" />
    </svg>
  );
}

function NodeListHeader({
  isTrashViewOpen,
  onOpenNotesView,
  onCreateRootNode,
  onEmptyTrash,
  trashCount
}: {
  isTrashViewOpen: boolean;
  onOpenNotesView: () => void;
  onCreateRootNode: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onEmptyTrash: () => void;
  trashCount: number;
}) {
  return (
    <header className="flex min-h-[40px] items-center justify-end px-3">
      <h2 className="sr-only">Nodes</h2>
      <button className="sr-only" onClick={onOpenNotesView} type="button">
        Nodes
      </button>
      {isTrashViewOpen ? (
        <>
          <button aria-label="New" className="sr-only" onClick={onCreateRootNode} type="button">
            New
          </button>
          <AppButton aria-label="Empty" className="text-foreground/70 hover:text-foreground" disabled={trashCount === 0} onClick={onEmptyTrash} size="sm" variant="subtle">
            Empty
          </AppButton>
        </>
      ) : (
        <AppIconButton
          aria-label="New"
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<NewNoteIcon />}
          label="New"
          onClick={onCreateRootNode}
        />
      )}
    </header>
  );
}

function useNodeListState(activeNodeId: string | null, nodeOrder: string[], nodesById: Record<string, Node>, selectedTrashNodeId: string | null): NodeListState {
  const trashedNodeIds = useWorkspaceStore((state) => state.trashedNodeIds);
  const visibleNodeOrder = nodeOrder.filter((id) => !trashedNodeIds.includes(id));
  const trashedNodeOrder = nodeOrder.filter((id) => trashedNodeIds.includes(id));
  const noteRows = buildNodeTreeRows(visibleNodeOrder, nodesById);
  const trashRows = buildNodeTreeRows(trashedNodeOrder, nodesById);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(activeNodeId ? [activeNodeId] : []);
  const [selectionAnchorNodeId, setSelectionAnchorNodeId] = useState<string | null>(activeNodeId);

  useEffect(() => {
    setSelectedNodeIds((prev) => prev.filter((id) => Boolean(nodesById[id])));
    setSelectionAnchorNodeId((prev) => (prev && nodesById[prev] ? prev : null));
  }, [nodesById]);

  useEffect(() => {
    if (!selectedTrashNodeId || !trashedNodeIds.includes(selectedTrashNodeId)) {
      return;
    }
    setSelectedNodeIds((prev) => (prev.length === 0 ? [selectedTrashNodeId] : prev));
    setSelectionAnchorNodeId((prev) => prev ?? selectedTrashNodeId);
  }, [selectedTrashNodeId, trashedNodeIds]);

  return {
    noteRows,
    trashRows,
    noteRowIds: noteRows.map((row) => row.node.id),
    trashRowIds: trashRows.map((row) => row.node.id),
    selectedNodeIds,
    setSelectedNodeIds,
    selectionAnchorNodeId,
    setSelectionAnchorNodeId
  };
}

function NodeListRows({
  rows,
  isTrashViewOpen,
  selectedTrashNodeId,
  activeNodeId,
  selectedNodeIds,
  onSelect,
  onContextMenu
}: {
  rows: ReturnType<typeof buildNodeTreeRows>;
  isTrashViewOpen: boolean;
  selectedTrashNodeId: string | null;
  activeNodeId: string | null;
  selectedNodeIds: string[];
  onSelect: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onContextMenu: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  if (rows.length === 0) {
    return isTrashViewOpen ? (
      <AppEmptyState description="Deleted nodes will appear here." title="Trash is empty" />
    ) : (
      <AppEmptyState description="Create or import a node to start editing." title="No nodes" />
    );
  }
  return rows.map((row) => (
    <NodeTreeRow
      depth={row.depth}
      isActive={(isTrashViewOpen ? selectedTrashNodeId : activeNodeId) === row.node.id}
      isSelected={selectedNodeIds.includes(row.node.id)}
      key={row.node.id}
      label={row.node.title}
      nodeId={row.node.id}
      onContextMenu={onContextMenu}
      onSelect={onSelect}
      showBranch={row.depth > 0 || row.hasChildren}
    />
  ));
}

export function NodeListTree({ activeNodeId, isTrashViewOpen, nodeOrder, nodesById, onOpenNotesView, onSelectNode, onSelectTrashNode, selectedTrashNodeId }: NodeListTreeProps) {
  const createRootNode = useWorkspaceStore((state) => state.createRootNode);
  const deleteNode = useWorkspaceStore((state) => state.deleteNode);
  const deleteNodePermanently = useWorkspaceStore((state) => state.deleteNodePermanently);
  const restoreNode = useWorkspaceStore((state) => state.restoreNode);
  const trashedNodeIds = useWorkspaceStore((state) => state.trashedNodeIds);
  const state = useNodeListState(activeNodeId, nodeOrder, nodesById, selectedTrashNodeId);
  const activeRows = isTrashViewOpen ? state.trashRows : state.noteRows;
  const [contextNodeId, setContextNodeId] = useState<string | null>(null);
  const [contextMenuMode, setContextMenuMode] = useState<MenuMode>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const closeContextMenu = () => {
    setContextNodeId(null);
    setContextMenuMode(null);
    setMenuPosition(null);
  };
  useEffect(() => onWindowKeydown((event) => event.key === 'Escape' && closeContextMenu()), []);
  const getContextTargets = () => {
    if (!contextNodeId) return [];
    const inTrashMenu = contextMenuMode === 'trash';
    const scoped = state.selectedNodeIds.filter((id) => (inTrashMenu ? trashedNodeIds.includes(id) : !trashedNodeIds.includes(id)));
    return scoped.includes(contextNodeId) ? scoped : [contextNodeId];
  };
  const handleSelectNode = (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    const isTrashNode = trashedNodeIds.includes(nodeId);
    const scopeIds = isTrashNode ? state.trashRowIds : state.noteRowIds;
    const scoped = state.selectedNodeIds.filter((id) => (isTrashNode ? trashedNodeIds.includes(id) : !trashedNodeIds.includes(id)));
    const notify = isTrashNode ? onSelectTrashNode : onSelectNode;
    const fallbackAnchor = isTrashNode ? selectedTrashNodeId ?? nodeId : activeNodeId ?? nodeId;
    if (event.shiftKey) return void (state.setSelectedNodeIds(collectRangeNodeIds(scopeIds, state.selectionAnchorNodeId ?? fallbackAnchor, nodeId)), notify(nodeId));
    if (event.metaKey || event.ctrlKey) return void handleToggleSelection(nodeId, scoped, state.setSelectedNodeIds, state.setSelectionAnchorNodeId, notify);
    state.setSelectedNodeIds([nodeId]);
    state.setSelectionAnchorNodeId(nodeId);
    notify(nodeId);
  };
  return (
    <>
      <aside aria-label="Node list panel" className="flex min-h-0 flex-col bg-bg-panel text-foreground">
        <NodeListHeader isTrashViewOpen={isTrashViewOpen} onCreateRootNode={(event) => (event.stopPropagation(), createRootNode(''))} onEmptyTrash={() => (state.trashRowIds.forEach((id) => deleteNodePermanently(id)), closeContextMenu())} onOpenNotesView={onOpenNotesView} trashCount={state.trashRows.length} />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-2">
          <section aria-label={isTrashViewOpen ? 'Trash section' : undefined} className="flex flex-1 flex-col gap-2">
            <NodeListRows rows={activeRows} isTrashViewOpen={isTrashViewOpen} selectedTrashNodeId={selectedTrashNodeId} activeNodeId={activeNodeId} selectedNodeIds={state.selectedNodeIds} onSelect={handleSelectNode} onContextMenu={(nodeId, event) => (event.preventDefault(), setContextNodeId(nodeId), setContextMenuMode(trashedNodeIds.includes(nodeId) ? 'trash' : 'notes'), setMenuPosition({ left: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)), top: Math.max(8, Math.min(event.clientY, window.innerHeight - 72)) }))} />
          </section>
        </div>
      </aside>
      {menuPosition ? <NodeListContextMenu isTrashMenu={contextMenuMode === 'trash'} left={menuPosition.left} onClose={closeContextMenu} onDeleteNode={() => (getContextTargets().sort((a, b) => state.noteRowIds.indexOf(a) - state.noteRowIds.indexOf(b)).forEach((id) => deleteNode(id)), closeContextMenu())} onDeleteNodePermanently={() => (getContextTargets().forEach((id) => deleteNodePermanently(id)), closeContextMenu())} onRestoreNode={() => (getContextTargets().forEach((id) => restoreNode(id)), closeContextMenu())} top={menuPosition.top} /> : null}
    </>
  );
}

function handleToggleSelection(
  nodeId: string,
  scopedSelection: string[],
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>,
  setSelectionAnchorNodeId: React.Dispatch<React.SetStateAction<string | null>>,
  notify: (nodeId: string) => void
) {
  const isSelected = scopedSelection.includes(nodeId);
  if (isSelected && scopedSelection.length > 1) {
    const next = scopedSelection.filter((id) => id !== nodeId);
    setSelectedNodeIds(next);
    notify(next[next.length - 1] ?? nodeId);
    return;
  }
  if (!isSelected) {
    setSelectedNodeIds([...scopedSelection, nodeId]);
    setSelectionAnchorNodeId(nodeId);
    notify(nodeId);
  }
}
