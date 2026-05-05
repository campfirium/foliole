import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';

import type { NodeTreeRow } from '../model/nodeTree';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../model/workspaceListNode';

import type { NodeSelectModifiers } from './NodeListTreeState';
import { NodeTreeRow as NodeTreeRowItem } from './NodeTreeRow';

interface TrashListRowsProps {
  activeNodeId: string | null;
  nodesById: WorkspaceListNodesById;
  onContextMenu: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  rows: NodeTreeRow[];
  rowSpacing: number;
  selectedNodeIds: string[];
}

function buildFolderPath(nodeId: string, nodesById: WorkspaceListNodesById) {
  const pathSegments: string[] = [];
  let currentNodeId = nodesById[nodeId]?.parentNodeId ?? null;

  while (currentNodeId) {
    const currentNode: WorkspaceListNode | undefined = nodesById[currentNodeId];
    if (!currentNode) {
      break;
    }
    if (currentNode.kind === 'folder') {
      pathSegments.push(currentNode.title);
    }
    currentNodeId = currentNode.parentNodeId ?? null;
  }

  return pathSegments.reverse().join(' / ') || 'Root';
}

function renderTrashRow(
  row: NodeTreeRow,
  props: Omit<TrashListRowsProps, 'rows'>
) {
  const isActive = props.activeNodeId === row.node.id;
  const isSelected = props.selectedNodeIds.includes(row.node.id);

  return (
    <NodeTreeRowItem
      depth={0}
      dragDisabledLabel={null}
      hasChildren={false}
      isActive={isActive}
      isBulkSelectionActive={props.selectedNodeIds.length > 1}
      isCollapsed={false}
      isDragDisabled
      isSelected={isSelected}
      key={row.node.id}
      label={row.node.title}
      nodeId={row.node.id}
      onContextMenu={props.onContextMenu}
      onKeyDown={props.onKeyDown}
      onSelect={props.onSelect}
      onToggleCollapse={() => undefined}
      rowSpacing={props.rowSpacing}
      secondaryLabel={buildFolderPath(row.node.id, props.nodesById)}
      showIcon={false}
    />
  );
}

export function TrashListRows(props: TrashListRowsProps) {
  return props.rows.map((row) => renderTrashRow(row, props));
}
