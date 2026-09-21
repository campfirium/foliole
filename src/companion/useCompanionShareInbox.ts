import { useEffect, useRef } from 'react';

import { consumeCompanionShareInbox, listenForCompanionShares } from './companionShareInboxRuntime';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

export function useCompanionShareInbox(workspace: ReturnType<typeof useCompanionWorkspaceSync>) {
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const hasWorkspaceSnapshot = Boolean(workspace.state.workspace_snapshot);

  useEffect(() => {
    if (!workspace.isWorkspaceSyncStateReady || !hasWorkspaceSnapshot) return;
    let disposed = false;
    let running = false;
    let rerun = false;
    const consume = async () => {
      if (running) { rerun = true; return; }
      running = true;
      do {
        rerun = false;
        await consumeCompanionShareInbox(workspaceRef.current).catch(() => undefined);
      } while (!disposed && rerun);
      running = false;
    };
    void consume();
    let remove: (() => Promise<void>) | undefined;
    void listenForCompanionShares(() => { void consume(); })
      .then(handle => { remove = () => handle.remove(); })
      .catch(() => undefined);
    return () => { disposed = true; void remove?.(); };
  }, [hasWorkspaceSnapshot, workspace.isWorkspaceSyncStateReady]);
}
