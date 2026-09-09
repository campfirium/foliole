import { useEffect, useMemo, useRef } from 'react';

import { createMemberSyncCadence, type MemberSyncCadence } from '../../lib/core/sync/memberSyncCadence';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import {
  readNativeAppActiveState,
  subscribeNativeAppBackground,
  subscribeNativeAppForeground
} from '../shared/platform/appLifecycle';
import { subscribeCompanionHighValueMutation } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
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
import { loadActiveCompanionSyncRun } from './companionSyncRunOwner';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';

function useForegroundSyncRefs(isSyncGroupReady: boolean, state: NativeCompanionWorkspaceSyncState) {
  const inFlightRef = useRef(false);
  const isAppActiveRef = useRef(true);
  const isSyncGroupReadyRef = useRef(isSyncGroupReady);
  const lastCheckedAtRef = useRef(0);
  const lastForegroundAtRef = useRef(0);
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
  cadence: MemberSyncCadence<ForegroundSyncReason>,
  run: (reason: ForegroundSyncReason, endpointUrl?: string) => void,
  cancelled: () => boolean
) {
  const unsubscribers: Array<() => void> = [];
  const keep = async (subscription: Promise<() => void>) => {
    const unsubscribe = await subscription;
    if (cancelled()) unsubscribe();
    else unsubscribers.push(unsubscribe);
  };
  void keep(subscribeNativeAppForeground(() => {
    refs.isAppActiveRef.current = true;
    cadence.updateFreshness({
      eligible: refs.isSyncGroupReadyRef.current
        && Boolean(resolveCompanionWorkspaceSyncEndpoint(refs.stateRef.current)),
      input: 'freshness'
    });
    run('foreground');
  }));
  void keep(subscribeNativeAppBackground(() => {
    refs.isAppActiveRef.current = false;
    cadence.updateFreshness({ eligible: false, input: null });
    clearRetryTimer(refs.retryTimerRef);
  }));
  unsubscribers.push(subscribeCompanionHighValueMutation(() => {
    void cadence.requestMutation('mutation');
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
    (reason: ForegroundSyncReason, endpointUrl?: string) => unknown
  >(() => undefined);
  const cadenceRef = useRef<MemberSyncCadence<ForegroundSyncReason> | null>(null);
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
    const cadence = createMemberSyncCadence<ForegroundSyncReason>({
      didSync: (result) => result === 'completed',
      getActiveRun: () => loadActiveCompanionSyncRun()?.completion ?? null,
      run: (reason) => runForegroundSyncCheck(reason)
    });
    cadenceRef.current = cadence;
    runForegroundSyncCheckRef.current = runForegroundSyncCheck;

    runForegroundSyncCheck('endpoint-ready');
    const unsubscribe = subscribeForegroundSyncEvents(refs, cadence, runForegroundSyncCheck, () => cancelled);
    return () => {
      cancelled = true;
      cadence.stop();
      if (cadenceRef.current === cadence) cadenceRef.current = null;
      clearRetryTimer(refs.retryTimerRef);
      unsubscribe();
    };
  }, [refs, setError, setReadableArticle, setState, setStatus, tryForegroundAutoSync]);

  useEffect(() => {
    const lastActualSyncAt = state.last_synced_at ? Date.parse(state.last_synced_at) : undefined;
    cadenceRef.current?.updateFreshness({
      eligible: isSyncGroupReady && refs.isAppActiveRef.current && Boolean(endpointUrl),
      input: 'freshness',
      ...(lastActualSyncAt !== undefined && Number.isFinite(lastActualSyncAt) ? { lastActualSyncAt } : {})
    });
  }, [endpointUrl, isSyncGroupReady, refs, state.last_synced_at]);
}
