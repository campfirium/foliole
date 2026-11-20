import { useCallback, useEffect, useRef, type UIEvent as ReactUIEvent } from 'react';

export function useCompanionImmersiveScrollPosition(
  nodeId: string,
  restoreScrollTop: number,
  onScrollTopChange?: (scrollTop: number) => void
) {
  const surfaceRef = useRef<HTMLElement | null>(null);
  const restoredNodeId = useRef<string | null>(null);

  // Restore only when an article opens; later snapshot refreshes carry older saved positions.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || restoredNodeId.current === nodeId) return;
    restoredNodeId.current = nodeId;
    surface.scrollTop = Math.max(0, restoreScrollTop);
  }, [nodeId, restoreScrollTop]);

  const handleScroll = useCallback((event: ReactUIEvent<HTMLElement>) => {
    onScrollTopChange?.(event.currentTarget.scrollTop);
  }, [onScrollTopChange]);

  return { handleScroll, surfaceRef };
}
