import { useEffect, useRef } from 'react';

import { onGlobalCaptureNavigate } from '../../shared/platform/runtimeShellEvents';
import { openWorkspaceNodeWithPreparedDocument } from '../../store/workspaceNodePreparation';
import { refreshWorkspaceState, refreshWorkspaceStateWithScope } from '../../store/workspaceRefreshScheduler';
import { useWorkspaceStore } from '../../store/workspaceStore';

/** A capture adds one Node; read it and the list it joined rather than the whole library. */
function refreshCapturedNode(nodeId: string) {
  const libraryScope = useWorkspaceStore.getState().libraryScope;
  if (!libraryScope) return refreshWorkspaceState('global-capture-navigation');
  return refreshWorkspaceStateWithScope({ kind: 'nodes', nodeIds: [nodeId], structure: true }, libraryScope,
    'global-capture-navigation');
}

export function useGlobalCaptureNavigation(onSelectNode: (nodeId: string) => Promise<void> | void) {
  const onSelectNodeRef = useRef(onSelectNode);
  useEffect(() => {
    onSelectNodeRef.current = onSelectNode;
  }, [onSelectNode]);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;
    void onGlobalCaptureNavigate(({ nodeId }) => {
      void refreshCapturedNode(nodeId).catch(() => undefined).then(async () => {
        if (isDisposed) {
          return;
        }
        await onSelectNodeRef.current(nodeId);
        if (!isDisposed && useWorkspaceStore.getState().activeNodeId !== nodeId) {
          const prepared = await openWorkspaceNodeWithPreparedDocument(nodeId, { forceLoad: true, keepWarm: true });
          if (!prepared && !isDisposed && useWorkspaceStore.getState().activeNodeId !== nodeId) {
            useWorkspaceStore.getState().openNode(nodeId);
          }
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
