import type { Virtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef } from 'react';

function remeasureMountedRows(virtualizer: Virtualizer<HTMLElement, Element>) {
  virtualizer.measure();
  // Rebuild the cleared layout before applying sizes, even if React has not rendered yet.
  virtualizer.getTotalSize();
  for (const element of virtualizer.elementsCache.values()) {
    if (!element.isConnected) continue;
    const index = virtualizer.indexFromElement(element);
    const size = virtualizer.options.measureElement(element, undefined, virtualizer);
    virtualizer.resizeItem(index, size);
  }
  virtualizer.getTotalSize();
}

export function useVirtualListViewportRemeasure(args: {
  isVirtual: boolean;
  virtualizer: Virtualizer<HTMLElement, Element>;
}) {
  const animationFrameRef = useRef<number | null>(null);
  const scheduleMeasure = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = window.requestAnimationFrame(() => {
      remeasureMountedRows(args.virtualizer);
      animationFrameRef.current = window.requestAnimationFrame(() => {
        remeasureMountedRows(args.virtualizer);
        animationFrameRef.current = null;
      });
    });
  }, [args.virtualizer]);

  useEffect(() => {
    if (!args.isVirtual) {
      return;
    }
    scheduleMeasure();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleMeasure();
      }
    };
    window.addEventListener('resize', scheduleMeasure);
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener('resize', scheduleMeasure);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [args.isVirtual, scheduleMeasure]);
  return animationFrameRef;
}
