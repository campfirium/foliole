import { useEffect, useMemo, useRef } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

import {
  clearRetryTimer,
  createForegroundSyncRunner,
  type CompanionSyncContinuationMode,
  type CompanionWorkspaceSyncStatus,
  type ForegroundSyncReason,
  type ForegroundSyncRefs,
  type TryForegroundAutoSync
} from './companionForegroundSyncRunner';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';

function useForegroundSyncRefs(isPairingReady: boolean, state: NativeCompanionWorkspaceSyncState) {
  const inFlightRef = useRef(false);
  const isPairingReadyRef = useRef(isPairingReady);
  const lastCheckedAtRef = useRef(0);
  const lastForegroundAtRef = useRef(0);
  const resourceContinuationModeRef = useRef<CompanionSyncContinuationMode>('full');
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  const refs: ForegroundSyncRefs = useMemo(() => ({
    inFlightRef,
    isPairingReadyRef,
    lastCheckedAtRef,
    lastForegroundAtRef,
    resourceContinuationModeRef,
    retryAttemptRef,
    retryTimerRef,
    stateRef
  }), []);

  useEffect(() => {
    refs.isPairingReadyRef.current = isPairingReady;
    refs.stateRef.current = state;
  }, [isPairingReady, refs, state]);

  return refs;
}

export function useForegroundAutoSync(
  setError: (error: string | null) => void,
  setReadableArticle: (article: CompanionReadableArticle | null) => void,
  setState: (state: NativeCompanionWorkspaceSyncState) => void,
  setSyncProgress: (progress: CompanionDesktopSyncProgress | null) => void,
  setStatus: (status: CompanionWorkspaceSyncStatus) => void,
  isPairingReady: boolean,
  state: NativeCompanionWorkspaceSyncState,
  tryForegroundAutoSync: TryForegroundAutoSync
) {
  const refs = useForegroundSyncRefs(isPairingReady, state);
  const runForegroundSyncCheckRef = useRef<(reason: ForegroundSyncReason) => void>(() => undefined);
  const endpointUrl = resolveCompanionWorkspaceSyncEndpoint(state);

  useEffect(() => {
    runForegroundSyncCheckRef.current('endpoint-ready');
  }, [endpointUrl, isPairingReady]);

  useEffect(() => {
    let cancelled = false;
    const runForegroundSyncCheck = createForegroundSyncRunner({
      cancelled: () => cancelled,
      ...refs,
      setError,
      setReadableArticle,
      setState,
      setSyncProgress,
      setStatus,
      tryForegroundAutoSync
    });
    runForegroundSyncCheckRef.current = runForegroundSyncCheck;

    runForegroundSyncCheck('endpoint-ready');
    let unsubscribe: (() => void) | null = null;
    void subscribeNativeAppForeground(() => runForegroundSyncCheck('foreground')).then((nextUnsubscribe) => {
      if (cancelled) {
        nextUnsubscribe();
        return;
      }
      unsubscribe = nextUnsubscribe;
    });
    return () => {
      cancelled = true;
      clearRetryTimer(refs.retryTimerRef);
      unsubscribe?.();
    };
  }, [refs, setError, setReadableArticle, setState, setStatus, tryForegroundAutoSync]);
}
