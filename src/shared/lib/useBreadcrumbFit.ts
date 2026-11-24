import { useLayoutEffect, useState, type RefObject } from 'react';

function measureVisibleLevels(line: HTMLElement, overflow: HTMLElement, count: number) {
  const available = line.clientWidth + 1;
  if (line.scrollWidth <= available) return count;

  const overflowWidth = overflow.getBoundingClientRect().width;
  let width = 0;
  let shown = 0;
  // The full line alternates level buttons and separators, followed by the overflow probe.
  for (let index = line.children.length - 2; index >= 0; index -= 2) {
    width += line.children[index]!.getBoundingClientRect().width;
    const separator = line.children[index + 1];
    if (separator !== overflow) width += separator!.getBoundingClientRect().width;
    if (width + overflowWidth <= available) shown += 1;
  }
  return width <= available ? count : Math.max(1, shown);
}

export function useBreadcrumbFit(
  containerRef: RefObject<HTMLElement | null>,
  overflowRef: RefObject<HTMLElement | null>,
  count: number,
  pathKey: string
) {
  const [fit, setFit] = useState({ layout: -1, pathKey, shown: count });
  const [layout, setLayout] = useState(0);
  const hasLevels = count > 0;
  const shown = fit.pathKey === pathKey && fit.layout === layout ? fit.shown : count;

  useLayoutEffect(() => {
    const line = containerRef.current;
    if (!line || typeof ResizeObserver === 'undefined') return undefined;
    let lastWidth = line.clientWidth;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry?.contentRect.width ?? 0);
      if (lastWidth === width) return;
      lastWidth = width;
      setLayout((version) => version + 1);
    });
    observer.observe(line);
    return () => observer.disconnect();
  }, [containerRef, hasLevels]);

  useLayoutEffect(() => {
    const line = containerRef.current;
    const overflow = overflowRef.current;
    if (!line || !overflow || shown !== count || count <= 1) return;
    const next = measureVisibleLevels(line, overflow, count);
    if (next < count) setFit({ layout, pathKey, shown: next });
  }, [containerRef, count, layout, overflowRef, pathKey, shown]);

  return shown;
}
