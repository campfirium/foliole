import { useLayoutEffect, useState, type RefObject } from 'react';

import { resolveNodeTreeRowVirtualSize } from '../../features/nodes/components/nodeListRowSpacingSettings';
import {
  getNodeListRowSpacing,
  resolveNodeListRowGap
} from '../../features/nodes/components/nodeListRowSpacingSettings';
import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';

import type { WorkspaceTopicTreeScrollPlacement } from './WorkspaceTopicTreeRows';

export function resolveSecondVisibleRowScrollPadding(
  containerHeight: number,
  rowSize: number,
  placement: WorkspaceTopicTreeScrollPlacement | undefined = 'second-visible-row'
) {
  const visibleRowsToReserve = placement === 'near-visible-row' ? 3 : 2;
  return Math.max(0, containerHeight - rowSize * visibleRowsToReserve);
}

export function useSecondVisibleRowScrollPadding(args: {
  enabled: boolean;
  placement?: WorkspaceTopicTreeScrollPlacement | undefined;
  rowGap: number;
  rowSpacing: number;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
  const [scrollPadding, setScrollPadding] = useState(0);
  useLayoutEffect(() => {
    if (!args.enabled) {
      setScrollPadding(0);
      return;
    }
    const container = args.scrollContainerRef.current;
    if (!container) {
      setScrollPadding(0);
      return;
    }
    const measurePadding = () => {
      const rowSize = resolveNodeTreeRowVirtualSize(args.rowSpacing, args.rowGap);
      setScrollPadding(resolveSecondVisibleRowScrollPadding(container.clientHeight, rowSize, args.placement));
    };
    measurePadding();
    const resizeObserver = new ResizeObserver(measurePadding);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [args.enabled, args.placement, args.rowGap, args.rowSpacing, args.scrollContainerRef]);
  return scrollPadding;
}

export function useWorkspaceTopicTreeRowScrollLayout(args: {
  activeNodeId: string | null;
  rows: readonly NodeTreeRow[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scrollPlacement: WorkspaceTopicTreeScrollPlacement | undefined;
  scrollTargetNodeId: string | null | undefined;
}) {
  const rowSpacing = getNodeListRowSpacing();
  const rowGap = resolveNodeListRowGap(rowSpacing);
  const isReviewScrollPlacement = args.scrollPlacement === 'second-visible-row' || args.scrollPlacement === 'near-visible-row';
  const scrollPaddingTop = resolveReviewScrollPaddingTop({
    activeNodeId: args.activeNodeId,
    rowGap,
    rows: args.rows,
    rowSpacing,
    scrollPlacement: args.scrollPlacement,
    scrollTargetNodeId: args.scrollTargetNodeId
  });
  const scrollPaddingBottom = useSecondVisibleRowScrollPadding({
    enabled: isReviewScrollPlacement,
    placement: args.scrollPlacement,
    rowGap,
    rowSpacing,
    scrollContainerRef: args.scrollContainerRef
  });
  return { rowGap, rowSpacing, scrollPaddingBottom, scrollPaddingTop };
}

function resolveReviewScrollPaddingTop(args: {
  activeNodeId: string | null;
  rowGap: number;
  rows: readonly NodeTreeRow[];
  rowSpacing: number;
  scrollPlacement: WorkspaceTopicTreeScrollPlacement | undefined;
  scrollTargetNodeId: string | null | undefined;
}) {
  if (args.scrollPlacement !== 'second-visible-row') {
    return 0;
  }
  const targetNodeId = args.scrollTargetNodeId ?? args.activeNodeId;
  const targetRowIndex = targetNodeId ? args.rows.findIndex((row) => row.node.id === targetNodeId) : -1;
  return targetRowIndex === 0 ? resolveNodeTreeRowVirtualSize(args.rowSpacing, args.rowGap) : 0;
}
