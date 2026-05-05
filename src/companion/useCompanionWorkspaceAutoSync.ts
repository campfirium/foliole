import { useEffect, useRef } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { isNativeAndroidCompanionRuntime } from '../shared/platform/companionWorkspaceSyncBridge';

import { shouldRunForegroundAutoSyncCheck } from './companionAutoSync';

type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';

export function useForegroundAutoSync(
  setError: (error: string | null) => void,
  setReadableArticle: (article: CompanionReadableArticle | null) => void,
  setState: (state: NativeCompanionWorkspaceSyncState) => void,
  setStatus: (status: CompanionWorkspaceSyncStatus) => void,
  state: NativeCompanionWorkspaceSyncState,
  tryForegroundAutoSync: (args: {
    cancelled: () => boolean;
    setError(error: string | null): void;
    setReadableArticle(article: CompanionReadableArticle | null): void;
    setState(state: NativeCompanionWorkspaceSyncState): void;
    setStatus(status: CompanionWorkspaceSyncStatus): void;
    state: NativeCompanionWorkspaceSyncState;
  }) => Promise<void>
) {
  const lastCheckedAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    function runForegroundSyncCheck() {
      const now = Date.now();
      if (!shouldRunForegroundAutoSyncCheck({
        isNativeRuntime: isNativeAndroidCompanionRuntime(),
        lastCheckedAt: lastCheckedAtRef.current,
        now
      })) {
        return;
      }
      lastCheckedAtRef.current = now;
      void tryForegroundAutoSync({
        cancelled: () => cancelled,
        setError,
        setReadableArticle,
        setState,
        setStatus,
        state
      });
    }

    runForegroundSyncCheck();
    let unsubscribe: (() => void) | null = null;
    void subscribeNativeAppForeground(runForegroundSyncCheck).then((nextUnsubscribe) => {
      if (cancelled) {
        nextUnsubscribe();
        return;
      }
      unsubscribe = nextUnsubscribe;
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [setError, setReadableArticle, setState, setStatus, state, tryForegroundAutoSync]);
}
