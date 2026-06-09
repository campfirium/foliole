import { useEffect } from 'react';

import { onGlobalCaptureNavigate } from '../../shared/platform/runtimeShellEvents';

export function useGlobalCaptureNavigation(onSelectNode: (nodeId: string) => void) {
  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;
    void onGlobalCaptureNavigate(({ nodeId }) => {
      if (!isDisposed) {
        onSelectNode(nodeId);
      }
    }).then((nextUnlisten) => {
      if (isDisposed) {
        nextUnlisten?.();
      } else {
        unlisten = nextUnlisten;
      }
    });
    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [onSelectNode]);
}
