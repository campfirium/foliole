import { useEffect, type RefObject } from 'react';

import { scrollActiveTreeItemIntoView } from './nodeListAutoScroll';

export function useNodeTreeActiveItemScroll(args: {
  activeNodeId: string | null;
  disabled?: boolean;
  scrollContainerRef: RefObject<HTMLElement | null>;
  scopeKey?: unknown;
}) {
  useEffect(() => {
    if (!args.activeNodeId || args.disabled) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      scrollActiveTreeItemIntoView(args.scrollContainerRef.current, args.activeNodeId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [args.activeNodeId, args.disabled, args.scopeKey, args.scrollContainerRef]);
}
