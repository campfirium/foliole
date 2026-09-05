import { useEffect, useMemo, useRef } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import {
  readNativeAppActiveState,
  subscribeNativeAppBackground,
  subscribeNativeAppForeground
} from '../shared/platform/appLifecycle';
import { subscribeCompanionSyncGroupServiceHint } from '../shared/platform/companion/sync/syncGroupProvider';
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

function useForegroundSyncRefs(isSyncGroupReady: boolean, state: NativeCompanionWorkspaceSyncState) {
  const inFlightRef = useRef(false);
  const isAppActiveRef = useRef(true);
  const isSyncGroupReadyRef = useRef(isSyncGroupReady);
  const lastCheckedAtRef = useRef(0);
  const lastForegroundAtRef = useRef(0);
  const pendingForegroundRef = useRef(false);
  const pendingServiceHintRef = useRef(new Set<string>());
  const resourceContinuationModeRef = useRef<CompanionSyncContinuationMode>('full');
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  const refs: ForegroundSyncRefs = useMemo(() => ({
    inFlightRef,
    isAppActiveRef,
    isSyncGroupReadyRef,
    lastCheckedAtRef,
    lastForegroundAtRef,
    pendingForegroundRef,
    pendingServiceHintRef,
    readAppActiveState: readNativeAppActiveState,
    resourceContinuationModeRef,
    retryAttemptRef,
    retryTimerRef,
    stateRef
  }), []);

  useEffect(() => {
    refs.isSyncGroupReadyRef.current = isSyncGroupReady;
    refs.stateRef.current = state;
  }, [isSyncGroupReady, refs, state]);

  return refs;
}

function subscribeForegroundSyncEvents(
  refs: ForegroundSyncRefs,
  run: (reason: ForegroundSyncReason, endpointUrl?: string) => void,
  cancelled: () => boolean
) {
  const unsubscribers: Array<() => void> = [];
  const keep = async (subscription: Promise<() => void>) => {
    const unsubscribe = await subscription;
    if (cancelled()) unsubscribe();
    else unsubscribers.push(unsubscribe);
  };
  void keep(subscribeCompanionSyncGroupServiceHint((hint) => run('service-hint', hint.endpoint_url)));
  void keep(subscribeNativeAppForeground(() => {
    refs.isAppActiveRef.current = true;
    run('foreground');
  }));
  void keep(subscribeNativeAppBackground(() => {
    refs.isAppActiveRef.current = false;
    clearRetryTimer(refs.retryTimerRef);
  }));
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export function useForegroundAutoSync(
  setError: (error: string | null) => void,
  setReadableArticle: (article: CompanionReadableArticle | null) => void,
  setState: (state: NativeCompanionWorkspaceSyncState) => void,
  setSyncProgress: (progress: CompanionDesktopSyncProgress | null) => void,
  setStatus: (status: CompanionWorkspaceSyncStatus) => void,
  isSyncGroupReady: boolean,
  state: NativeCompanionWorkspaceSyncState,
  tryForegroundAutoSync: TryForegroundAutoSync
) {
  const refs = useForegroundSyncRefs(isSyncGroupReady, state);
  const runForegroundSyncCheckRef = useRef<
    (reason: ForegroundSyncReason, endpointUrl?: string) => void
  >(() => undefined);
  const endpointUrl = resolveCompanionWorkspaceSyncEndpoint(state);

  useEffect(() => {
    runForegroundSyncCheckRef.current('endpoint-ready');
  }, [endpointUrl, isSyncGroupReady]);

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
    const unsubscribe = subscribeForegroundSyncEvents(refs, runForegroundSyncCheck, () => cancelled);
    return () => {
      cancelled = true;
      clearRetryTimer(refs.retryTimerRef);
      unsubscribe();
    };
  }, [refs, setError, setReadableArticle, setState, setStatus, tryForegroundAutoSync]);
}
