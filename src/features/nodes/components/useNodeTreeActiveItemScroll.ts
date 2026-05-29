import { useLayoutEffect, type RefObject } from 'react';

import {
  scrollActiveTreeItemIntoView,
  scrollTreeItemToNearbyVisibleRow,
  scrollTreeItemToSecondVisibleRow
} from './nodeListAutoScroll';

export type NodeTreeActiveItemScrollPlacement = 'comfort' | 'second-visible-row' | 'near-visible-row';

export function useNodeTreeActiveItemScroll(args: {
  activeNodeId: string | null;
  disabled?: boolean;
  placement?: NodeTreeActiveItemScrollPlacement;
  scrollContainerRef: RefObject<HTMLElement | null>;
  scopeKey?: unknown;
}) {
  useLayoutEffect(() => {
    if (!args.activeNodeId || args.disabled) {
      return;
    }
    const scrollTarget = () => {
      if (args.placement === 'second-visible-row') {
        scrollTreeItemToSecondVisibleRow(args.scrollContainerRef.current, args.activeNodeId);
        return;
      }
      if (args.placement === 'near-visible-row') {
        scrollTreeItemToNearbyVisibleRow(args.scrollContainerRef.current, args.activeNodeId);
        return;
      }
      scrollActiveTreeItemIntoView(args.scrollContainerRef.current, args.activeNodeId);
    };
    scrollTarget();
    const frame = window.requestAnimationFrame(scrollTarget);
    return () => window.cancelAnimationFrame(frame);
  }, [args.activeNodeId, args.disabled, args.placement, args.scopeKey, args.scrollContainerRef]);
}
