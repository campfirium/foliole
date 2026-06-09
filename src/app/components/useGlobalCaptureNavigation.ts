import { useEffect, useRef } from 'react';

import { onGlobalCaptureNavigate } from '../../shared/platform/runtimeShellEvents';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function useGlobalCaptureNavigation(onSelectNode: (nodeId: string) => Promise<void> | void) {
  const onSelectNodeRef = useRef(onSelectNode);
  useEffect(() => {
    onSelectNodeRef.current = onSelectNode;
  }, [onSelectNode]);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;
    void onGlobalCaptureNavigate(({ nodeId }) => {
      void refreshWorkspaceState('global-capture-navigation').catch(() => undefined).then(async () => {
        if (isDisposed) {
          return;
        }
        await onSelectNodeRef.current(nodeId);
        if (!isDisposed && useWorkspaceStore.getState().activeNodeId !== nodeId) {
          useWorkspaceStore.getState().openNode(nodeId);
        }
      });
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
  }, []);
}
