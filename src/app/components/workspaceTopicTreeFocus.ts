import type { RefObject } from 'react';

import { useNodeTreeActiveItemScroll } from '../../features/nodes/components/useNodeTreeActiveItemScroll';
import type { NodeTreeActiveItemScrollPlacement } from '../../features/nodes/components/useNodeTreeActiveItemScroll';
import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import { getTextAnchorLocators } from '../../features/nodes/model/nodeTypes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import type { NodeViewState } from '../../store/workspaceStore';

function rangeContainsSelectionPoint(locator: { from: number; to: number }, selection: NonNullable<NodeViewState['selection']>) {
  const point = Math.min(selection.from, selection.to);
  return point >= locator.from && point <= locator.to;
}

function rangeOverlapsSelection(locator: { from: number; to: number }, selection: NonNullable<NodeViewState['selection']>) {
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  if (from === to) {
    return rangeContainsSelectionPoint(locator, selection);
  }
  return locator.from < to && locator.to > from;
}

function nodeMatchesSelection(
  nodeId: string,
  nodesById: WorkspaceListNodesById,
  selection: NonNullable<NodeViewState['selection']>
) {
  const anchorLink = nodesById[nodeId]?.anchorLink;
  if (!anchorLink?.locator) {
    return false;
  }
  return getTextAnchorLocators(anchorLink.locator).some((locator) =>
    rangeOverlapsSelection(locator, selection)
  );
}

export function resolveWorkspaceTopicTreeFocusNodeId(args: {
  activeNodeId: string | null;
  nodeViewState: NodeViewState | undefined;
  nodesById: WorkspaceListNodesById;
  rows: readonly NodeTreeRow[];
}) {
  if (args.activeNodeId && args.rows.some((row) => row.node.id === args.activeNodeId)) {
    return args.activeNodeId;
  }
  const selection = args.nodeViewState?.selection;
  if (!selection) {
    return args.activeNodeId;
  }
  return args.rows.find((row) => nodeMatchesSelection(row.node.id, args.nodesById, selection))?.node.id ?? args.activeNodeId;
}

export function useWorkspaceTopicTreeAutoScroll(args: {
  activeFolderId: string;
  focusedNodeId: string | null;
  focusedRowIndex: number;
  placement?: NodeTreeActiveItemScrollPlacement;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scrollNodeId?: string | null;
  visibleRowsLength: number;
}) {
  const scrollNodeId = args.scrollNodeId ?? args.focusedNodeId;
  useNodeTreeActiveItemScroll({
    activeNodeId: scrollNodeId,
    scopeKey: `${args.activeFolderId}:${args.visibleRowsLength}:${args.focusedRowIndex}:${scrollNodeId ?? 'none'}`,
    scrollContainerRef: args.scrollContainerRef,
    ...definedProps({ placement: args.placement })
  });
}
