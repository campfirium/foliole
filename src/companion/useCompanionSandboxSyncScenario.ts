import { useEffect, useEffectEvent, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import type {} from '../shared/platform/companion/preview/companionSandboxScenarios';

import { tryForegroundAutoSync, type CompanionWorkspaceSyncStatus } from './companionWorkspaceSyncFlow';

const failureCode = 'discovery_connection_failed';
const noScenario = () => false;
const noSubscription = () => () => {};

type SyncView = {
  error: string | null;
  isWorkspaceSyncStateReady: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
  setState: Dispatch<SetStateAction<NativeCompanionWorkspaceSyncState>>;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  state: NativeCompanionWorkspaceSyncState;
};

export function useCompanionSandboxSyncScenario(
  view: SyncView,
  setSyncProgress: (progress: CompanionDesktopSyncProgress | null) => void
) {
  const store = import.meta.env.DEV && typeof window !== 'undefined' ? window.__folioleSandboxScenarios : undefined;
  const enabled = useSyncExternalStore(store?.subscribe ?? noSubscription,
    () => store?.isEnabled('sync-failure') ?? false, noScenario);
  const run = useEffectEvent(() => {
    const previousError = view.error;
    let cancelled = false;
    void tryForegroundAutoSync({
      cancelled: () => cancelled,
      setError: view.setError,
      setState: view.setState,
      setSyncProgress,
      setStatus: view.setStatus,
      state: { ...view.state, endpoint_url: 'https://foliole-sandbox.invalid' },
      triggerReason: 'automatic'
    }, async () => { throw new Error(failureCode); });
    return () => {
      cancelled = true;
      view.setError(current => current === failureCode ? previousError : current);
    };
  });
  useEffect(() => {
    if (enabled && view.isWorkspaceSyncStateReady) return run();
  }, [enabled, view.isWorkspaceSyncStateReady]);
}
