import { useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
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
  onSelectNode: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onToggleCollapse: (nodeId: string) => void;
  rows: NodeTreeRow[];
}

function renderWorkspaceTopicTreeRow(
  row: NodeTreeRow,
  args: {
    activeNodeId: string | null;
    collapsedNodeIds: ReadonlySet<string>;
    nodesById: WorkspaceListNodesById;
    onContextMenu: Parameters<typeof NodeTreeRowItem>[0]['onContextMenu'];
    onRowKeyDown: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
    onSelectNode: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
    onToggleCollapse: (nodeId: string) => void;
    rowSpacing: number;
  }
) {
  const node = args.nodesById[row.node.id];
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
      isCollapsed={args.collapsedNodeIds.has(row.node.id)}
      isSelected={args.activeNodeId === row.node.id}
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
      showIcon={false}
      onContextMenu={args.onContextMenu}
      rowSpacing={args.rowSpacing}
      onKeyDown={args.onRowKeyDown}
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
  onSelectNode,
  onToggleCollapse,
  rows
}: WorkspaceTopicTreeRowsProps) {
  const rowSpacing = getNodeListRowSpacing();
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
    <section aria-label="Current folder item list" className="flex flex-col" role="tree">
      {rows.map((row) =>
        renderWorkspaceTopicTreeRow(row, {
          activeNodeId,
          collapsedNodeIds,
          nodesById,
          onContextMenu,
          onRowKeyDown,
          onSelectNode,
          onToggleCollapse,
          rowSpacing
        })
      )}
    </section>
  );
}
