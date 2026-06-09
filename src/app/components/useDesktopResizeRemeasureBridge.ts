import { useEffect } from 'react';

import { onMainWindowResized } from '../../shared/platform/windowControls';

function dispatchViewportResize() {
  window.dispatchEvent(new Event('resize'));
}

function scheduleViewportResizeDispatch() {
  dispatchViewportResize();
  const firstFrame = window.requestAnimationFrame(() => {
    dispatchViewportResize();
    window.requestAnimationFrame(dispatchViewportResize);
  });
  return () => window.cancelAnimationFrame(firstFrame);
}

export function useDesktopResizeRemeasureBridge() {
  useEffect(() => {
    let cancelScheduledDispatch: (() => void) | null = null;
    let unsubscribe: (() => void) | null = null;
    let disposed = false;
    cancelScheduledDispatch = scheduleViewportResizeDispatch();

    void onMainWindowResized(() => {
      cancelScheduledDispatch?.();
      cancelScheduledDispatch = scheduleViewportResizeDispatch();
    }).then((nextUnsubscribe) => {
      if (disposed) {
        nextUnsubscribe?.();
        return;
      }
      unsubscribe = nextUnsubscribe;
    });

    return () => {
      disposed = true;
      cancelScheduledDispatch?.();
      unsubscribe?.();
    };
  }, []);
}
