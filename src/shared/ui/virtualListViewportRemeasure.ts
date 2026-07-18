import type { Virtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef } from 'react';

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
      args.virtualizer.measure();
      animationFrameRef.current = window.requestAnimationFrame(() => {
        args.virtualizer.measure();
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
}
