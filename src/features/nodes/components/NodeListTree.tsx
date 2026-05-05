import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';

import { Button, EmptyState, Panel } from '../../../shared/ui';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { buildNodeTreeRows } from '../model/nodeTree';
import type { Node } from '../model/nodeTypes';

import { NodeTreeRow } from './NodeTreeRow';

interface NodeListTreeProps {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}

export function NodeListTree({ activeNodeId, nodeOrder, nodesById, onSelectNode }: NodeListTreeProps) {
  const createRootNode = useWorkspaceStore((state) => state.createRootNode);
  const deleteNode = useWorkspaceStore((state) => state.deleteNode);
  const restoreNode = useWorkspaceStore((state) => state.restoreNode);
  const deleteNodePermanently = useWorkspaceStore((state) => state.deleteNodePermanently);
  const trashedNodeIds = useWorkspaceStore((state) => state.trashedNodeIds);
  const [isTrashViewOpen, setIsTrashViewOpen] = useState(false);
  const [selectedTrashNodeId, setSelectedTrashNodeId] = useState<string | null>(null);
  const visibleNodeOrder = nodeOrder.filter((id) => !trashedNodeIds.includes(id));
  const trashedNodeOrder = nodeOrder.filter((id) => trashedNodeIds.includes(id));
  const displayNodeOrder = isTrashViewOpen ? trashedNodeOrder : visibleNodeOrder;
  const treeRows = buildNodeTreeRows(displayNodeOrder, nodesById);
  const rowNodeIds = treeRows.map((row) => row.node.id);
  const [contextNodeId, setContextNodeId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(activeNodeId ? [activeNodeId] : []);
  const [selectionAnchorNodeId, setSelectionAnchorNodeId] = useState<string | null>(activeNodeId);
  useEffect(() => {
    setSelectedNodeIds((prev) => {
      const next = prev.filter((id) => Boolean(nodesById[id]) && !trashedNodeIds.includes(id));
      return next.length === prev.length ? prev : next;
    });
    setSelectionAnchorNodeId((prev) => (prev && nodesById[prev] && !trashedNodeIds.includes(prev) ? prev : null));
  }, [nodesById, trashedNodeIds]);

  useEffect(() => {
    if (!activeNodeId) {
      setSelectedNodeIds([]);
      setSelectionAnchorNodeId(null);
      return;
    }
    if (trashedNodeIds.includes(activeNodeId)) {
      setSelectedNodeIds([]);
      setSelectionAnchorNodeId(null);
      return;
    }
    setSelectedNodeIds((prev) => (prev.includes(activeNodeId) ? prev : [activeNodeId]));
    setSelectionAnchorNodeId((prev) => prev ?? activeNodeId);
  }, [activeNodeId, trashedNodeIds]);

  const closeContextMenu = () => {
    setContextNodeId(null);
    setMenuPosition(null);
  };
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
    };
  }, []);

  const handleNodeContextMenu = (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setContextNodeId(nodeId);
    setMenuPosition({
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - 72))
    });
  };
  const handleDeleteNode = () => {
    if (!contextNodeId) {
      return;
    }
    const targets = selectedNodeIds.includes(contextNodeId) ? selectedNodeIds : [contextNodeId];
    const orderedTargets = [...targets].sort((a, b) => rowNodeIds.indexOf(a) - rowNodeIds.indexOf(b));
    for (const nodeId of orderedTargets) {
      deleteNode(nodeId);
    }
    closeContextMenu();
  };

  const toggleTrashView = () => {
    setIsTrashViewOpen((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedTrashNodeId(null);
      }
      return next;
    });
    closeContextMenu();
    setSelectedNodeIds([]);
    setSelectionAnchorNodeId(null);
  };
  const handleCreateRootNode = () => {
    createRootNode('');
  };
  const handleSelectNode = (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    if (isTrashViewOpen) {
      setSelectedTrashNodeId(nodeId);
      return;
    }

    const isRangeSelection = event.shiftKey;
    const isToggleSelection = event.metaKey || event.ctrlKey;
    if (isRangeSelection) {
      const anchorNodeId = selectionAnchorNodeId ?? activeNodeId ?? nodeId;
      const rangeNodeIds = collectRangeNodeIds(rowNodeIds, anchorNodeId, nodeId);
      setSelectedNodeIds(rangeNodeIds);
      onSelectNode(nodeId);
      return;
    }
    if (isToggleSelection) {
      const isSelected = selectedNodeIds.includes(nodeId);
      if (isSelected && selectedNodeIds.length > 1) {
        const nextSelectedNodeIds = selectedNodeIds.filter((id) => id !== nodeId);
        setSelectedNodeIds(nextSelectedNodeIds);
        if (activeNodeId === nodeId) {
          onSelectNode(nextSelectedNodeIds[nextSelectedNodeIds.length - 1] ?? nodeId);
        }
        return;
      }
      if (isSelected) {
        return;
      }
      setSelectedNodeIds([...selectedNodeIds, nodeId]);
      setSelectionAnchorNodeId(nodeId);
      onSelectNode(nodeId);
      return;
    }
    setSelectedNodeIds([nodeId]);
    setSelectionAnchorNodeId(nodeId);
    onSelectNode(nodeId);
  };

  const handleRestoreNode = () => {
    if (!selectedTrashNodeId) {
      return;
    }
    restoreNode(selectedTrashNodeId);
    setSelectedTrashNodeId(null);
  };

  const handleDeleteNodePermanently = () => {
    if (!selectedTrashNodeId) {
      return;
    }
    deleteNodePermanently(selectedTrashNodeId);
    setSelectedTrashNodeId(null);
  };

  const selectedTrashNode = selectedTrashNodeId ? nodesById[selectedTrashNodeId] : null;
  return (
    <>
      <Panel
        ariaLabel="Node list panel"
        actions={
          <Button aria-label="New" disabled={isTrashViewOpen} onClick={handleCreateRootNode} size="sm" variant="subtle">
            New
          </Button>
        }
        as="aside"
        bodyClassName="node-list"
        className="panel-list"
        footer={
          <button
            aria-label="Trash"
            aria-pressed={isTrashViewOpen}
            className="trash-footer-button"
            onClick={toggleTrashView}
            type="button"
          >
            Trash
          </button>
        }
        scrollBody
        title={isTrashViewOpen ? 'Trash' : 'Nodes'}
      >
        {isTrashViewOpen && selectedTrashNode ? (
          <section aria-label="Trash item preview" className="trash-preview">
            <p className="trash-preview-title">{selectedTrashNode.title}</p>
            <pre className="trash-preview-content">{selectedTrashNode.content}</pre>
            <div className="trash-preview-actions">
              <Button onClick={handleRestoreNode} size="sm" variant="ghost">
                Restore
              </Button>
              <Button onClick={handleDeleteNodePermanently} size="sm" variant="ghost">
                Delete Permanently
              </Button>
            </div>
          </section>
        ) : null}
        {treeRows.length === 0 ? (
          <EmptyState
            description={isTrashViewOpen ? 'Deleted nodes will appear here.' : 'Create or import a node to start editing.'}
            title={isTrashViewOpen ? 'Trash is empty' : 'No nodes'}
          />
        ) : (
          treeRows.map((row) => (
            <NodeTreeRow
              depth={row.depth}
              isActive={!isTrashViewOpen && activeNodeId === row.node.id}
              isSelected={selectedNodeIds.includes(row.node.id)}
              key={row.node.id}
              label={row.node.title}
              nodeId={row.node.id}
              onContextMenu={isTrashViewOpen ? undefined : handleNodeContextMenu}
              onSelect={handleSelectNode}
              showBranch={row.depth > 0 || row.hasChildren}
            />
          ))
        )}
      </Panel>
      {menuPosition ? (
        <>
          <div aria-hidden="true" className="editor-context-menu-scrim" onPointerDown={closeContextMenu} />
          <div
            aria-label="Node commands"
            className="editor-context-menu"
            onContextMenu={(event) => event.preventDefault()}
            role="menu"
            style={{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }}
          >
            <button className="editor-context-menu-item" onClick={handleDeleteNode} role="menuitem" type="button">
              Delete Node
            </button>
          </div>
        </>
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
