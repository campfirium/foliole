import { useEffect, useRef } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import { isNativeCompanionRuntime } from '../shared/platform/companionBootstrap';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

import { shouldRunForegroundAutoSyncCheck } from './companionAutoSync';

type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';

function subscribeForegroundSources(args: {
  cancelled: () => boolean;
  maybeAutoSync: () => void;
}) {
  let unsubscribeNativeForeground: () => void = () => undefined;
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      args.maybeAutoSync();
    }
  };

  window.addEventListener('focus', args.maybeAutoSync);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  void subscribeNativeAppForeground(args.maybeAutoSync).then((unsubscribe) => {
    if (args.cancelled()) {
      unsubscribe();
      return;
    }
    unsubscribeNativeForeground = unsubscribe;
  });

  return () => {
    window.removeEventListener('focus', args.maybeAutoSync);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    unsubscribeNativeForeground();
  };
}

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
      if (!state.endpoint_url) {
        return;
      }
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

    const unsubscribeForegroundSources = subscribeForegroundSources({
      cancelled: () => cancelled,
      maybeAutoSync
    });
    maybeAutoSync();
    return () => {
      cancelled = true;
      unsubscribeForegroundSources();
    };
  }, [setError, setReadableArticle, setState, setStatus, state, tryForegroundAutoSync]);
}
