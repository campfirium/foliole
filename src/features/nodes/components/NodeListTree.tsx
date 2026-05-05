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
  const deleteNode = useWorkspaceStore((state) => state.deleteNode);
  const treeRows = buildNodeTreeRows(nodeOrder, nodesById);
  const [contextNodeId, setContextNodeId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);

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
    deleteNode(contextNodeId);
    closeContextMenu();
  };

  return (
    <>
      <Panel
        ariaLabel="Node list panel"
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
              key={row.node.id}
              label={row.node.title}
              nodeId={row.node.id}
              onContextMenu={handleNodeContextMenu}
              onSelect={onSelectNode}
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
  label: string;
  nodeId: string;
  onContextMenu: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onSelect: (nodeId: string) => void;
  showBranch: boolean;
}

function NodeTreeRow({ depth, isActive, label, nodeId, onContextMenu, onSelect, showBranch }: NodeTreeRowProps) {
  const style = {
    '--node-depth': depth
  } as CSSProperties;

  return (
    <Button
      active={isActive}
      aria-pressed={isActive}
      className="node-row node-tree-row"
      onContextMenu={(event) => onContextMenu(nodeId, event)}
      onClick={() => onSelect(nodeId)}
      style={style}
      variant="list"
    >
      <span aria-hidden="true" className="node-tree-branch" data-visible={showBranch} />
      <span className="node-tree-title">{label}</span>
    </Button>
  );
}
