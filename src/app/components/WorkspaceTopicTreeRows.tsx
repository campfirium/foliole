import { useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import {
  getNodeListRowSpacing,
  resolveNodeListRowGap
} from '../../features/nodes/components/nodeListRowSpacingSettings';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import type { NodeSelectModifiers } from '../../features/nodes/components/NodeListTreeState';
import { NodeTreeRow as NodeTreeRowItem } from '../../features/nodes/components/NodeTreeRow';
import { resolveNodeTreeRowIconKind, resolveNodeTreeRowIconState } from '../../features/nodes/components/NodeTreeRowIconModel';
import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { isFsrsWorkspaceListNode } from '../../features/nodes/model/workspaceListNode';

interface WorkspaceTopicTreeRowsProps {
  activeNodeId: string | null;
  collapsedNodeIds: ReadonlySet<string>;
  nodesById: WorkspaceListNodesById;
  onContextMenu: Parameters<typeof NodeTreeRowItem>[0]['onContextMenu'];
  onRenameNode: (nodeId: string, title: string) => void;
  onSelectNode: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onToggleCollapse: (nodeId: string) => void;
  rows: NodeTreeRow[];
  selectedNodeIds: string[];
}

function renderWorkspaceTopicTreeRow(
  row: NodeTreeRow,
  args: {
    activeNodeId: string | null;
    collapsedNodeIds: ReadonlySet<string>;
    nodesById: WorkspaceListNodesById;
    onContextMenu: Parameters<typeof NodeTreeRowItem>[0]['onContextMenu'];
    onRenameNode: (nodeId: string, title: string) => void;
    onRowKeyDown: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
    onSelectNode: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
    onToggleCollapse: (nodeId: string) => void;
    rowSpacing: number;
    selectedNodeIds: string[];
  }
) {
  const node = args.nodesById[row.node.id];
  const isSelected = args.selectedNodeIds.includes(row.node.id);
  const isDerivedNode = Boolean(node?.anchorLink);
  const isReviewCard = isFsrsWorkspaceListNode(node);
  const nodeIconState = resolveNodeTreeRowIconState({
    isDismissed: node?.reading?.state === 'dismissed',
    hasEnteredSchedule: isReviewCard
      ? node?.review?.lastReviewAt !== null && node?.review?.lastReviewAt !== undefined
      : (node?.reading?.repetitionCount ?? 0) > 0
  });

  return (
    <NodeTreeRowItem
      descendantCount={row.descendantCount}
      depth={row.depth}
      hasChildren={row.hasChildren}
      isActive={args.activeNodeId === row.node.id}
      isBulkSelectionActive={args.selectedNodeIds.length > 1}
      isCollapsed={args.collapsedNodeIds.has(row.node.id)}
      isDerived={isDerivedNode}
      isSelected={isSelected}
      key={row.node.id}
      label={row.node.title}
      nodeId={row.node.id}
      nodeIconKind={resolveNodeTreeRowIconKind({
        hasChildren: row.hasChildren,
        isCollapsed: args.collapsedNodeIds.has(row.node.id),
        isReviewCard,
        kind: node?.kind ?? 'topic'
      })}
      nodeIconState={nodeIconState}
      showIcon
      onContextMenu={args.onContextMenu}
      rowSpacing={args.rowSpacing}
      onKeyDown={args.onRowKeyDown}
      onRename={args.onRenameNode}
      onSelect={args.onSelectNode}
      onToggleCollapse={args.onToggleCollapse}
    />
  );
}

export function WorkspaceTopicTreeRows({
  activeNodeId,
  collapsedNodeIds,
  nodesById,
  onContextMenu,
  onRenameNode,
  onSelectNode,
  onToggleCollapse,
  rows,
  selectedNodeIds
}: WorkspaceTopicTreeRowsProps) {
  const rowSpacing = getNodeListRowSpacing();
  const rowGap = resolveNodeListRowGap(rowSpacing);
  const onRowKeyDown = useMemo(
    () =>
      createNodeListRowKeydownHandler({
        collapsedNodeIds,
        onSelect: onSelectNode,
        onToggleCollapse,
        rows
      }),
    [collapsedNodeIds, onSelectNode, onToggleCollapse, rows]
  );

  return (
    <section
      aria-label="Topic list"
      className="flex flex-1 flex-col"
      data-node-list-row-gap={String(rowGap)}
      data-node-list-row-spacing={String(rowSpacing)}
      role="tree"
      style={{ gap: `${rowGap}px` }}
    >
      {rows.map((row) =>
        renderWorkspaceTopicTreeRow(row, {
          activeNodeId,
          collapsedNodeIds,
          nodesById,
          onContextMenu,
          onRenameNode,
          onRowKeyDown,
          onSelectNode,
          onToggleCollapse,
          rowSpacing,
          selectedNodeIds
        })
      )}
    </section>
  );
}
