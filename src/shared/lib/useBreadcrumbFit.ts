import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Returns how many of the nearest breadcrumb levels fit on one line of `containerRef`.
 * Starts from every level and drops the farthest one per layout pass until the line stops overflowing,
 * keeping at least one level; a resize or a different path starts over.
 */
export function useBreadcrumbFit(containerRef: RefObject<HTMLElement | null>, count: number, pathKey: string) {
  const [fit, setFit] = useState({ pathKey, shown: count });
  const [layoutVersion, setLayoutVersion] = useState(0);
  const lastWidth = useRef<number | null>(null);
  const hasLevels = count > 0;
  const shown = fit.pathKey === pathKey ? Math.min(fit.shown, count) : count;

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry?.contentRect.width ?? 0);
      if (lastWidth.current === width) return;
      lastWidth.current = width;
      setLayoutVersion(version => version + 1);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef, hasLevels]);

  useLayoutEffect(() => {
    setFit({ pathKey, shown: count });
  }, [count, layoutVersion, pathKey]);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element || shown <= 1) return;
    if (element.scrollWidth > element.clientWidth + 1) setFit({ pathKey, shown: shown - 1 });
  });

  return shown;
}
