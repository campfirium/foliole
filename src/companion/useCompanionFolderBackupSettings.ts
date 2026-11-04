import { useCallback, useEffect, useRef, useState } from 'react';

import { companionFolderSync, readCompanionFolderSyncState } from '../shared/platform/companion/folderSync/companionFolderSync';

type State = Awaited<ReturnType<typeof readCompanionFolderSyncState>>;

function useFolderBackupReadState() {
  const [state, setState] = useState<State | null>(null);
  const [running, setRunning] = useState(Boolean(companionFolderSync.getActiveRun()));
  const [error, setError] = useState(false);
  const revision = useRef(0);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    const id = ++revision.current;
    try {
      const value = await readCompanionFolderSyncState();
      if (mounted.current && id === revision.current) { setState(value); setError(false); }
    } catch (failure) {
      if (mounted.current && id === revision.current) setError(true);
      throw failure;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const update = () => {
      setRunning(Boolean(companionFolderSync.getActiveRun()));
      void refresh().catch(() => undefined);
    };
    const unsubscribe = companionFolderSync.subscribe(update);
    update();
    return () => { mounted.current = false; revision.current++; unsubscribe(); };
  }, [refresh]);
  return { state, running, error, setError, refresh };
}

export function useCompanionFolderBackupSettings() {
  const model = useFolderBackupReadState();
  const { state, setError, refresh } = model;
  const [busy, setBusy] = useState<'choose' | 'write' | 'reload' | 'toggle' | null>(null);
  async function act(action: 'choose' | 'write' | 'reload') {
    setBusy(action);
    setError(false);
    try {
      if (action === 'choose') await companionFolderSync.choose();
      else if (action === 'write') await companionFolderSync.write();
      await refresh();
    } catch (failure) {
      try { await refresh(); } catch { /* Retain the last visible result when state cannot be read. */ }
      if (!(failure instanceof Error && /folder_sync_(disabled|scope_changed)/u.test(failure.message))) setError(true);
    } finally { setBusy(null); }
  }
  async function setEnabled(enabled: boolean) {
    setBusy('toggle');
    setError(false);
    try {
      if (enabled && !state?.location?.authorized) {
        const selected = await companionFolderSync.choose();
        if (selected.cancelled) return;
      }
      await companionFolderSync.setEnabled(enabled);
      await refresh();
    } catch {
      try { await refresh(); } catch { /* The failed toggle does not replace the saved configuration. */ }
      setError(true);
    } finally { setBusy(null); }
  }
  return { ...model, busy, error: model.error || Boolean(state?.location?.failure), act, setEnabled };
}
