import { useEffect, useRef, useState } from 'react';

import { TextBodyTooLargeError } from '../../lib/core/nodes/textBodyBudget';

import { consumeCompanionShareInbox, listenForCompanionShares } from './companionShareInboxRuntime';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

export function useCompanionShareInbox(workspace: ReturnType<typeof useCompanionWorkspaceSync>) {
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const [failed, setFailed] = useState<false | 'incomplete' | 'text-too-large'>(false);
  const [pending, setPending] = useState(false);
  const retryRef = useRef<() => void>(() => {});
  const hasWorkspaceSnapshot = Boolean(workspace.state.workspace_snapshot);

  useEffect(() => {
    if (!workspace.isWorkspaceSyncStateReady || !hasWorkspaceSnapshot) return;
    let disposed = false;
    let running = false;
    let rerun = false;
    const consume = async () => {
      if (disposed) return;
      if (running) { rerun = true; return; }
      running = true;
      setPending(true);
      do {
        rerun = false;
        try {
          await consumeCompanionShareInbox(workspaceRef.current);
          if (!disposed) setFailed(false);
        } catch (error) {
          if (!disposed) setFailed(error instanceof TextBodyTooLargeError ? 'text-too-large' : 'incomplete');
        }
      } while (!disposed && rerun);
      running = false;
      if (!disposed) setPending(false);
    };
    retryRef.current = () => { void consume(); };
    void consume();
    let remove: (() => Promise<void>) | undefined;
    void listenForCompanionShares(() => { void consume(); })
      .then(handle => {
        if (disposed) void handle.remove();
        else remove = () => handle.remove();
      })
      .catch(() => { if (!disposed) setFailed('incomplete'); });
    return () => {
      disposed = true;
      retryRef.current = () => {};
      void remove?.();
    };
  }, [hasWorkspaceSnapshot, workspace.isWorkspaceSyncStateReady]);
  return { failed, pending, retry: () => retryRef.current(), dismiss: () => setFailed(false) };
}
