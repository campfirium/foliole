import { useCallback, useEffect, useRef, type UIEvent as ReactUIEvent } from 'react';

export function useCompanionImmersiveScrollPosition(
  nodeId: string,
  restoreScrollTop: number,
  onScrollTopChange?: (scrollTop: number) => void
) {
  const surfaceRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (surface) surface.scrollTop = Math.max(0, restoreScrollTop);
  }, [nodeId, restoreScrollTop]);

  const handleScroll = useCallback((event: ReactUIEvent<HTMLElement>) => {
    onScrollTopChange?.(event.currentTarget.scrollTop);
  }, [onScrollTopChange]);

  return { handleScroll, surfaceRef };
}
