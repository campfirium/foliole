import type { CSSProperties } from 'react';

import { Button, EmptyState, Panel } from '../../../shared/ui';
import { buildNodeTreeRows } from '../model/nodeTree';
import type { Node } from '../model/nodeTypes';

interface NodeListTreeProps {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}

export function NodeListTree({ activeNodeId, nodeOrder, nodesById, onSelectNode }: NodeListTreeProps) {
  const treeRows = buildNodeTreeRows(nodeOrder, nodesById);

  return (
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
            onSelect={onSelectNode}
            showBranch={row.depth > 0 || row.hasChildren}
          />
        ))
      )}
    </Panel>
  );
}

interface NodeTreeRowProps {
  depth: number;
  isActive: boolean;
  label: string;
  nodeId: string;
  onSelect: (nodeId: string) => void;
  showBranch: boolean;
}

function NodeTreeRow({ depth, isActive, label, nodeId, onSelect, showBranch }: NodeTreeRowProps) {
  const style = {
    '--node-depth': depth
  } as CSSProperties;

  return (
    <Button
      active={isActive}
      aria-pressed={isActive}
      className="node-row node-tree-row"
      onClick={() => onSelect(nodeId)}
      style={style}
      variant="list"
    >
      <span aria-hidden="true" className="node-tree-branch" data-visible={showBranch} />
      <span className="node-tree-title">{label}</span>
    </Button>
  );
}
