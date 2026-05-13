import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, RefObject } from 'react';

import { VirtualListSurface, type VirtualListRenderMeta } from '../../../shared/ui';
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
  scrollContainerRef: RefObject<HTMLElement | null>;
  selectedNodeIds: string[];
}

const NODE_TREE_ROW_BASE_HEIGHT = 28;
const TRASH_ROW_SECONDARY_LABEL_HEIGHT = 18;

export function resolveNodeTreeRowVirtualSize(rowSpacing: number) {
  return NODE_TREE_ROW_BASE_HEIGHT + rowSpacing * 2;
}

function resolveTrashRowVirtualSize(rowSpacing: number) {
  return resolveNodeTreeRowVirtualSize(rowSpacing) + TRASH_ROW_SECONDARY_LABEL_HEIGHT;
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
  props: Omit<TrashListRowsProps, 'rows'>,
  meta?: VirtualListRenderMeta
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
      {...(meta ? { ariaPosInSet: meta.ariaPosInSet, ariaSetSize: meta.ariaSetSize } : {})}
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
  return (
    <VirtualListSurface
      estimateSize={() => resolveTrashRowVirtualSize(props.rowSpacing)}
      getItemKey={(row) => row.node.id}
      items={props.rows}
      renderItem={(row, meta) => renderTrashRow(row, props, meta)}
      scrollElementRef={props.scrollContainerRef}
      scrollToIndex={props.activeNodeId ? props.rows.findIndex((row) => row.node.id === props.activeNodeId) : null}
    />
  );
}
