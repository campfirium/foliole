import { useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';

import { Button, EmptyState, Panel } from '../../../shared/ui';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { buildNodeTreeRows } from '../model/nodeTree';
import type { Node } from '../model/nodeTypes';

interface NodeListTreeProps {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}

export function NodeListTree({ activeNodeId, nodeOrder, nodesById, onSelectNode }: NodeListTreeProps) {
  const createRootNode = useWorkspaceStore((state) => state.createRootNode);
  const deleteNode = useWorkspaceStore((state) => state.deleteNode);
  const treeRows = buildNodeTreeRows(nodeOrder, nodesById);
  const rowNodeIds = treeRows.map((row) => row.node.id);
  const [contextNodeId, setContextNodeId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(activeNodeId ? [activeNodeId] : []);
  const [selectionAnchorNodeId, setSelectionAnchorNodeId] = useState<string | null>(activeNodeId);

  useEffect(() => {
    setSelectedNodeIds((prev) => {
      const next = prev.filter((id) => Boolean(nodesById[id]));
      return next.length === prev.length ? prev : next;
    });
    setSelectionAnchorNodeId((prev) => (prev && nodesById[prev] ? prev : null));
  }, [nodesById]);

  useEffect(() => {
    if (!activeNodeId) {
      setSelectedNodeIds([]);
      setSelectionAnchorNodeId(null);
      return;
    }
    setSelectedNodeIds((prev) => (prev.includes(activeNodeId) ? prev : [activeNodeId]));
    setSelectionAnchorNodeId((prev) => prev ?? activeNodeId);
  }, [activeNodeId]);

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

  const handleCreateRootNode = () => {
    createRootNode('');
  };

  const handleSelectNode = (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
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

  return (
    <>
      <Panel
        ariaLabel="Node list panel"
        actions={
          <Button aria-label="New" onClick={handleCreateRootNode} size="sm" variant="subtle">
            New
          </Button>
        }
        as="aside"
        bodyClassName="node-list"
        className="panel-list"
        scrollBody
        title="Nodes"
      >
        {treeRows.length === 0 ? (
          <EmptyState description="Create or import a node to start editing." title="No nodes" />
        ) : (
          treeRows.map((row) => (
            <NodeTreeRow
              depth={row.depth}
              isActive={activeNodeId === row.node.id}
              isSelected={selectedNodeIds.includes(row.node.id)}
              key={row.node.id}
              label={row.node.title}
              nodeId={row.node.id}
              onContextMenu={handleNodeContextMenu}
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

interface NodeTreeRowProps {
  depth: number;
  isActive: boolean;
  isSelected: boolean;
  label: string;
  nodeId: string;
  onContextMenu: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onSelect: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  showBranch: boolean;
}

function NodeTreeRow({ depth, isActive, isSelected, label, nodeId, onContextMenu, onSelect, showBranch }: NodeTreeRowProps) {
  const style = {
    '--node-depth': depth
  } as CSSProperties;

  return (
    <Button
      active={isSelected}
      aria-current={isActive ? 'page' : undefined}
      aria-pressed={isSelected}
      className="node-row node-tree-row"
      onContextMenu={(event) => onContextMenu(nodeId, event)}
      onClick={(event) => onSelect(nodeId, event)}
      style={style}
      variant="list"
    >
      <span aria-hidden="true" className="node-tree-branch" data-visible={showBranch} />
      <span className="node-tree-title">{label}</span>
    </Button>
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
