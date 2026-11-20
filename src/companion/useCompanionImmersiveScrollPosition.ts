import { useCallback, useEffect, useRef, type UIEvent as ReactUIEvent } from 'react';

const READER_INPUT_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;

export function useCompanionImmersiveScrollPosition(
  nodeId: string,
  restoreScrollTop: number,
  onScrollTopChange?: (scrollTop: number) => void
) {
  const surfaceRef = useRef<HTMLElement | null>(null);
  const readerOwnedNodeId = useRef<string | null>(null);

  // A saved position can reach an open article after a snapshot refresh. Apply it until the reader
  // acts; afterwards a refresh carries an older position and must not move the article.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (surface && readerOwnedNodeId.current !== nodeId) surface.scrollTop = Math.max(0, restoreScrollTop);
  }, [nodeId, restoreScrollTop]);

  useEffect(() => {
    const takeOver = () => { readerOwnedNodeId.current = nodeId; };
    for (const type of READER_INPUT_EVENTS) document.addEventListener(type, takeOver, { capture: true, passive: true });
    return () => {
      for (const type of READER_INPUT_EVENTS) document.removeEventListener(type, takeOver, { capture: true });
    };
  }, [nodeId]);

  const handleScroll = useCallback((event: ReactUIEvent<HTMLElement>) => {
    onScrollTopChange?.(event.currentTarget.scrollTop);
  }, [onScrollTopChange]);

  return { handleScroll, surfaceRef };
}
