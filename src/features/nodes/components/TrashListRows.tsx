import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';

import { cn } from '../../../shared/lib/utils';
import { AppButton } from '../../../shared/ui';
import type { NodeTreeRow } from '../model/nodeTree';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../model/workspaceListNode';

import type { NodeSelectModifiers } from './NodeListTreeState';

interface TrashListRowsProps {
  activeNodeId: string | null;
  nodesById: WorkspaceListNodesById;
  onContextMenu: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  rows: NodeTreeRow[];
  selectedNodeIds: string[];
}

function resolveSelectModifiers(event: ReactMouseEvent<HTMLButtonElement>): NodeSelectModifiers {
  return {
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey
  };
}

function buildEntityChain(nodeId: string, nodesById: WorkspaceListNodesById) {
  const chain: WorkspaceListNode[] = [];
  let currentNodeId: string | null = nodeId;

  while (currentNodeId) {
    const currentNode: WorkspaceListNode | undefined = nodesById[currentNodeId];
    if (!currentNode) {
      break;
    }
    if (currentNode.kind === 'folder') {
      break;
    }
    chain.push(currentNode);
    currentNodeId = currentNode.parentNodeId ?? null;
  }

  return chain.reverse();
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

function renderEntityChain(row: NodeTreeRow, nodesById: WorkspaceListNodesById) {
  const entityChain = row.node.kind === 'folder' ? [row.node] : buildEntityChain(row.node.id, nodesById);

  return entityChain.map((node, index) => (
    <div
      className={cn(
        'w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap pr-[0.4rem]',
        node.id === row.node.id ? 'font-bold text-foreground' : 'font-normal text-foreground/80'
      )}
      key={node.id}
      style={{ paddingLeft: `${index * 20}px` }}
    >
      {node.title}
    </div>
  ));
}

function renderTrashRow(
  row: NodeTreeRow,
  props: Omit<TrashListRowsProps, 'rows'>
) {
  const isActive = props.activeNodeId === row.node.id;
  const isSelected = props.selectedNodeIds.includes(row.node.id);

  return (
    <AppButton
      aria-current={isActive ? 'page' : undefined}
      aria-pressed={isSelected}
      aria-selected={isSelected}
      className={cn(
        'min-h-0 w-full items-start justify-start overflow-hidden rounded-md px-[0.4rem] py-3 text-left',
        isSelected ? 'bg-foreground/[0.05] text-foreground' : 'text-foreground/85 hover:bg-foreground/[0.03]'
      )}
      key={row.node.id}
      onClick={(event) => props.onSelect(row.node.id, resolveSelectModifiers(event))}
      onContextMenu={(event) => props.onContextMenu(row.node.id, event)}
      onKeyDown={(event) => props.onKeyDown(row.node.id, event)}
      role="treeitem"
      variant="list"
    >
      <span className="flex min-w-0 w-full flex-1 flex-col gap-2 overflow-hidden pr-[0.4rem]">
        <span className="flex min-w-0 w-full flex-col gap-1.5 overflow-hidden">
          {renderEntityChain(row, props.nodesById)}
        </span>
        <span className="w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap pr-[0.4rem] text-xs text-foreground/55">
          {buildFolderPath(row.node.id, props.nodesById)}
        </span>
      </span>
    </AppButton>
  );
}

export function TrashListRows(props: TrashListRowsProps) {
  return props.rows.map((row) => renderTrashRow(row, props));
}
