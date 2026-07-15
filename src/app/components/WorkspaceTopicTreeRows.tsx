import { useMemo, type ReactNode, type RefObject } from 'react';

import {
  resolveNodeTreeRowVirtualSize
} from '../../features/nodes/components/nodeListRowSpacingSettings';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import type { NodeSelectModifiers } from '../../features/nodes/components/NodeListTreeState';
import { NodeTreeRow as NodeTreeRowItem } from '../../features/nodes/components/NodeTreeRow';
import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { VirtualListSurface } from '../../shared/ui';

import type { WorkspaceTopicTreeDragController } from './workspaceTopicTreeDrag';
import { WorkspaceTopicTreeRowItem } from './WorkspaceTopicTreeRowItem';
import { useWorkspaceTopicTreeRowScrollLayout } from './workspaceTopicTreeScrollPadding';

export type WorkspaceTopicTreeScrollPlacement = 'comfort' | 'second-visible-row' | 'near-visible-row';

interface WorkspaceTopicTreeRowsProps {
  activeNodeId: string | null;
  collapsedNodeIds: ReadonlySet<string>;
  drag: WorkspaceTopicTreeDragController;
  isManualSort: boolean;
  nodesById: WorkspaceListNodesById;
  onContextMenu: Parameters<typeof NodeTreeRowItem>[0]['onContextMenu'];
  onRenameNode: (nodeId: string, title: string) => void;
  onSelectNode: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onToggleCollapse: (nodeId: string) => void;
  rows: NodeTreeRow[];
  scrollPlacement?: WorkspaceTopicTreeScrollPlacement;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scrollTargetNodeId?: string | null;
  selectedNodeIds: string[];
}

function resolveActiveRowIndex(rows: readonly NodeTreeRow[], activeNodeId: string | null) {
  return activeNodeId ? rows.findIndex((row) => row.node.id === activeNodeId) : null;
}

function resolveSecondVisibleRowAnchorIndex(rows: readonly NodeTreeRow[], activeNodeId: string | null) {
  const activeRowIndex = resolveActiveRowIndex(rows, activeNodeId);
  return activeRowIndex === null || activeRowIndex < 0 ? null : Math.max(activeRowIndex - 1, 0);
}

function resolveNearVisibleRowAnchorIndex(rows: readonly NodeTreeRow[], activeNodeId: string | null) {
  const activeRowIndex = resolveActiveRowIndex(rows, activeNodeId);
  return activeRowIndex === null || activeRowIndex < 0 ? null : Math.max(activeRowIndex - 2, 0);
}

function resolveScrollAnchorIndex(
  rows: readonly NodeTreeRow[],
  scrollTargetNodeId: string | null,
  scrollPlacement: WorkspaceTopicTreeScrollPlacement | undefined
) {
  if (scrollPlacement === 'second-visible-row') {
    return resolveSecondVisibleRowAnchorIndex(rows, scrollTargetNodeId);
  }
  if (scrollPlacement === 'near-visible-row') {
    return resolveNearVisibleRowAnchorIndex(rows, scrollTargetNodeId);
  }
  return null;
}

function renderWorkspaceTopicTreeVirtualList(args: WorkspaceTopicTreeRowsProps & {
  onRowKeyDown: ReturnType<typeof createNodeListRowKeydownHandler>;
  rowGap: number;
  rowSpacing: number;
  titleFontSize: number;
}) {
  return (
    <VirtualListSurface
      autoScroll={args.scrollPlacement === 'second-visible-row' || args.scrollPlacement === 'near-visible-row'}
      estimateSize={(index) => resolveNodeTreeRowVirtualSize(args.rowSpacing, index === args.rows.length - 1 ? 0 : args.rowGap, args.titleFontSize)}
      getItemKey={(row) => row.node.id}
      items={args.rows}
      renderItem={(row, meta) =>
        <WorkspaceTopicTreeRowItem
          activeNodeId={args.activeNodeId}
          collapsedNodeIds={args.collapsedNodeIds}
          drag={args.drag}
          isManualSort={args.isManualSort}
          meta={meta}
          nodesById={args.nodesById}
          onContextMenu={args.onContextMenu}
          onRenameNode={args.onRenameNode}
          onRowKeyDown={args.onRowKeyDown}
          onSelectNode={args.onSelectNode}
          onToggleCollapse={args.onToggleCollapse}
          row={row}
          rowSpacing={args.rowSpacing}
          selectedNodeIds={args.selectedNodeIds}
        />}
      scrollAnchorIndex={resolveScrollAnchorIndex(args.rows, args.scrollTargetNodeId ?? args.activeNodeId, args.scrollPlacement)}
      scrollElementRef={args.scrollContainerRef}
      scrollToIndex={resolveActiveRowIndex(args.rows, args.scrollTargetNodeId ?? args.activeNodeId)}
      threshold={20}
    />
  );
}

function renderWorkspaceTopicTreeRowsSection(args: {
  ariaLabel: string;
  children: ReactNode;
  rowGap: number;
  rowSpacing: number;
  scrollPaddingBottom: number;
  scrollPaddingTop: number;
}) {
  return (
    <section
      aria-label={args.ariaLabel}
      className="flex flex-1 flex-col"
      data-node-list-row-gap={String(args.rowGap)}
      data-node-list-row-spacing={String(args.rowSpacing)}
      role="tree"
      style={{ gap: `${args.rowGap}px`, paddingBottom: args.scrollPaddingBottom, paddingTop: args.scrollPaddingTop }}
    >
      {args.children}
    </section>
  );
}

function useWorkspaceTopicTreeKeydown(props: WorkspaceTopicTreeRowsProps) {
  return useMemo(
    () => createNodeListRowKeydownHandler({
      collapsedNodeIds: props.collapsedNodeIds,
      onSelect: props.onSelectNode,
      onToggleCollapse: props.onToggleCollapse,
      rows: props.rows
    }),
    [props.collapsedNodeIds, props.onSelectNode, props.onToggleCollapse, props.rows]
  );
}

export function WorkspaceTopicTreeRows({
  activeNodeId,
  collapsedNodeIds,
  drag,
  isManualSort,
  nodesById,
  onContextMenu,
  onRenameNode,
  onSelectNode,
  onToggleCollapse,
  rows,
  scrollPlacement,
  scrollContainerRef,
  scrollTargetNodeId,
  selectedNodeIds
}: WorkspaceTopicTreeRowsProps) {
  const t = useTranslation();
  const { navigationTitleFontSize, rowGap, rowSpacing, scrollPaddingBottom, scrollPaddingTop } = useWorkspaceTopicTreeRowScrollLayout({
    activeNodeId,
    rows,
    scrollContainerRef,
    scrollPlacement,
    scrollTargetNodeId
  });
  const onRowKeyDown = useWorkspaceTopicTreeKeydown({ activeNodeId, collapsedNodeIds, drag, isManualSort, nodesById, onContextMenu, onRenameNode, onSelectNode, onToggleCollapse, rows, scrollContainerRef, selectedNodeIds, ...definedProps({ scrollPlacement, scrollTargetNodeId }) });

  return renderWorkspaceTopicTreeRowsSection({
    ariaLabel: t('desktop.workspace.topicList'),
    rowGap,
    rowSpacing,
    scrollPaddingBottom,
    scrollPaddingTop,
    children: renderWorkspaceTopicTreeVirtualList({
        activeNodeId,
        collapsedNodeIds,
        drag,
        isManualSort,
        nodesById,
        onContextMenu,
        onRenameNode,
        onRowKeyDown,
        onSelectNode,
        onToggleCollapse,
        rowGap,
        rows,
        rowSpacing,
        titleFontSize: navigationTitleFontSize,
        scrollContainerRef,
        selectedNodeIds,
        ...definedProps({ scrollPlacement, scrollTargetNodeId })
      })
  });
}
