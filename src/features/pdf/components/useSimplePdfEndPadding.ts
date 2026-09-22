import { useLayoutEffect, useState, type RefObject } from 'react';

// Leave only enough room to align a short final page with the reader's start.
export function useSimplePdfEndPadding(scrollRef: RefObject<HTMLDivElement | null>, lastPageHeight: number) {
  const [padding, setPadding] = useState(0);
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const measure = () => {
      const bottom = Number.parseFloat(getComputedStyle(scroll).paddingBottom) || 0;
      setPadding(Math.max(0, scroll.clientHeight - lastPageHeight - bottom));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [lastPageHeight, scrollRef]);
  return padding;
}
