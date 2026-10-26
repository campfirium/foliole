import { useEffect } from 'react';

import { startReviewTrainingIdle } from '../../features/review/model/reviewTrainingIdle';
import { isRuntimeInvokeAvailable } from '../../shared/platform/runtimeInvoke';
import { onWorkspaceContentChanged, onWorkspaceSyncApplied } from '../../shared/platform/runtimeShellEvents';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function useReviewTrainingIdle(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !isRuntimeInvokeAvailable()) return;
    const training = startReviewTrainingIdle();
    const unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
      if (state.nodesById !== previous.nodesById) training.wake();
    });
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const subscriptions = [onWorkspaceContentChanged(training.wake), onWorkspaceSyncApplied(training.wake)];
    for (const subscription of subscriptions) void subscription.then(unlisten => {
      if (disposed) unlisten?.();
      else if (unlisten) unlisteners.push(unlisten);
    }).catch(() => undefined);
    return () => {
      disposed = true; training.dispose(); unsubscribe();
      for (const unlisten of unlisteners) unlisten();
    };
  }, [enabled]);
}
