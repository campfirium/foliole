import { useEffect, useRef, type MutableRefObject } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { isNativeAndroidCompanionRuntime } from '../shared/platform/companionWorkspaceSyncBridge';

import { shouldRunForegroundAutoSyncCheck } from './companionAutoSync';

type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';

type TryForegroundAutoSync = (args: {
  cancelled: () => boolean;
  setError(error: string | null): void;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  state: NativeCompanionWorkspaceSyncState;
}) => Promise<void>;

function createForegroundSyncRunner(args: {
  cancelled: () => boolean;
  inFlightRef: MutableRefObject<boolean>;
  lastCheckedAtRef: MutableRefObject<number>;
  setError: (error: string | null) => void;
  setReadableArticle: (article: CompanionReadableArticle | null) => void;
  setState: (state: NativeCompanionWorkspaceSyncState) => void;
  setStatus: (status: CompanionWorkspaceSyncStatus) => void;
  stateRef: MutableRefObject<NativeCompanionWorkspaceSyncState>;
  tryForegroundAutoSync: TryForegroundAutoSync;
}) {
  return () => {
    if (args.inFlightRef.current) return;
    const now = Date.now();
    if (!shouldRunForegroundAutoSyncCheck({
      isNativeRuntime: isNativeAndroidCompanionRuntime(),
      lastCheckedAt: args.lastCheckedAtRef.current,
      now
    })) return;
    args.lastCheckedAtRef.current = now;
    args.inFlightRef.current = true;
    void args.tryForegroundAutoSync({
      cancelled: args.cancelled,
      setError: args.setError,
      setReadableArticle: args.setReadableArticle,
      setState: args.setState,
      setStatus: args.setStatus,
      state: args.stateRef.current
    }).finally(() => {
      args.inFlightRef.current = false;
    });
  };
}

export function useForegroundAutoSync(
  setError: (error: string | null) => void,
  setReadableArticle: (article: CompanionReadableArticle | null) => void,
  setState: (state: NativeCompanionWorkspaceSyncState) => void,
  setStatus: (status: CompanionWorkspaceSyncStatus) => void,
  state: NativeCompanionWorkspaceSyncState,
  tryForegroundAutoSync: TryForegroundAutoSync
) {
  const inFlightRef = useRef(false);
  const lastCheckedAtRef = useRef(0);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    const runForegroundSyncCheck = createForegroundSyncRunner({
      cancelled: () => cancelled,
      inFlightRef,
      lastCheckedAtRef,
      setError,
      setReadableArticle,
      setState,
      setStatus,
      stateRef,
      tryForegroundAutoSync
    });

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
  }, [setError, setReadableArticle, setState, setStatus, tryForegroundAutoSync]);
}
