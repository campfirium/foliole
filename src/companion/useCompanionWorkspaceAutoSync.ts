import { useEffect, useRef } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { isNativeCompanionRuntime } from '../shared/platform/companionBootstrap';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

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
  const lastAutoCheckAtRef = useRef(0);

  useEffect(() => {
    if (!isNativeCompanionRuntime()) {
      return;
    }

    let cancelled = false;
    const maybeAutoSync = () => {
      const now = Date.now();
      if (
        !shouldRunForegroundAutoSyncCheck({
          isNativeRuntime: true,
          lastCheckedAt: lastAutoCheckAtRef.current,
          now
        })
      ) {
        return;
      }
      lastAutoCheckAtRef.current = now;
      void tryForegroundAutoSync({
        cancelled: () => cancelled,
        setError,
        setReadableArticle,
        setState,
        setStatus,
        state
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        maybeAutoSync();
      }
    };

    window.addEventListener('focus', maybeAutoSync);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', maybeAutoSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [setError, setReadableArticle, setState, setStatus, state, tryForegroundAutoSync]);
}
