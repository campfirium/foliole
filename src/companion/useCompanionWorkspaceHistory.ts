import { useEffect, useRef, useState } from 'react';

import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { loadCompanionFlowHistoryAvailability } from '../shared/platform/companion/runtime/companionFlowHistory';
import { subscribeCompanionSyncMutationRevision } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

export function useCompanionWorkspaceHistoryAvailability(key: string) {
  const [availability, setAvailability] = useState({ canUndo: false, canRedo: false });
  useEffect(() => {
    let mounted = true;
    async function update() {
      if (!isAvailableNativeCompanionRuntime()) return;
      const next = await loadCompanionFlowHistoryAvailability(key);
      if (mounted) setAvailability(next);
    }
    const refresh = () => { void update().catch(() => { if (mounted) setAvailability({ canUndo: false, canRedo: false }); }); };
    refresh();
    const unsubscribe = subscribeCompanionSyncMutationRevision(refresh);
    return () => { mounted = false; unsubscribe(); };
  }, [key]);

  return availability;
}

export function useCompanionWorkspaceTransaction(props: { flush(): Promise<unknown>; refresh(): Promise<unknown>; afterRefresh(): void }) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const locked = useRef(false);
  const committed = useRef(false);

  async function run(task: () => Promise<void>) {
    if (locked.current) return;
    const scope = getCompanionReadingScope();
    locked.current = true;
    setBusy(true);
    setError(false);
    try {
      if (!committed.current) {
        await props.flush();
        if (scope !== getCompanionReadingScope()) return;
        await task();
        committed.current = true;
      }
      if (scope !== getCompanionReadingScope()) return;
      if (!await props.refresh()) throw new Error('workspace_refresh_failed');
      committed.current = false;
      setPending(false);
      props.afterRefresh();
    } catch { setError(true); setPending(committed.current); }
    finally { locked.current = false; setBusy(false); }
  }
  return { run, busy, pending, error };
}
