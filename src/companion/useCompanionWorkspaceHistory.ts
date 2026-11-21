import { useEffect, useRef, useState } from 'react';

import type { TranslationKey } from '../shared/localization/translations';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { loadCompanionFlowHistoryAvailability } from '../shared/platform/companion/runtime/companionFlowHistory';
import type { CompanionHistoryTop } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { startCompanionWorkspaceActionTiming } from '../shared/platform/companion/runtime/companionWorkspaceActionTiming';
import { subscribeCompanionSyncMutationRevision } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

export function useCompanionWorkspaceHistoryAvailability(key: string) {
  const [availability, setAvailability] = useState<{ canUndo: boolean; canRedo: boolean;
    undoTop: CompanionHistoryTop; redoTop: CompanionHistoryTop }>({ canUndo: false, canRedo: false, undoTop: null, redoTop: null });
  useEffect(() => {
    let mounted = true;
    async function update() {
      if (!isAvailableNativeCompanionRuntime()) return;
      const next = await loadCompanionFlowHistoryAvailability(key);
      if (mounted) setAvailability(next);
    }
    const refresh = () => { void update().catch(() => {
      if (mounted) setAvailability({ canUndo: false, canRedo: false, undoTop: null, redoTop: null });
    }); };
    refresh();
    const unsubscribe = subscribeCompanionSyncMutationRevision(refresh);
    return () => { mounted = false; unsubscribe(); };
  }, [key]);

  return availability;
}

export function useCompanionWorkspaceTransaction(props: { flush(): Promise<unknown>; refresh(): Promise<unknown>; afterRefresh(): void }) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<TranslationKey | null>(null);
  const locked = useRef(false);
  const committed = useRef(false);

  /** `preview` shows the expected result at once and returns how to withdraw it if nothing commits. */
  async function run(task: () => Promise<void>, afterSave?: () => void, failureKey: TranslationKey = 'companion.reading.historyError',
    preview?: () => () => void) {
    if (locked.current) return;
    const scope = getCompanionReadingScope();
    locked.current = true;
    setBusy(true);
    setFailure(null);
    const withdraw = committed.current ? undefined : preview?.();
    const timing = startCompanionWorkspaceActionTiming();
    const timed = async <T,>(stage: Parameters<typeof timing.stage>[0], work: () => Promise<T>) => {
      const end = timing.stage(stage);
      try { return await work(); } finally { end(); }
    };
    let status: 'completed' | 'failed' | null = null;
    try {
      if (!committed.current) {
        await timed('flush', () => props.flush());
        if (scope !== getCompanionReadingScope()) return;
        await timed('task', task);
        committed.current = true;
        if (scope === getCompanionReadingScope()) afterSave?.();
      }
      if (scope !== getCompanionReadingScope()) return;
      if (!await timed('refresh', () => props.refresh())) throw new Error('workspace_refresh_failed');
      status = 'completed';
      committed.current = false;
      setPending(false);
      props.afterRefresh();
    } catch { status = 'failed'; setFailure(failureKey); setPending(committed.current); }
    finally {
      if (status) timing.finish(status);
      // A committed write keeps its preview until the refreshed snapshot replaces it.
      if (!committed.current) withdraw?.();
      locked.current = false;
      setBusy(false);
    }
  }
  return { run, busy, pending, failure, clearFailure: () => setFailure(null) };
}
