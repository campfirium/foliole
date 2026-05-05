import { useEffect, useRef, type MutableRefObject } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import { isNativeAndroidCompanionRuntime } from '../shared/platform/companionWorkspaceSyncBridge';

import { shouldRunForegroundAutoSyncCheck } from './companionAutoSync';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';

type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';
type ForegroundAutoSyncOutcome = 'completed' | 'failed' | 'skipped';
type ForegroundSyncReason = 'endpoint-ready' | 'foreground' | 'retry';
const FOREGROUND_DUPLICATE_EVENT_WINDOW_MS = 1_000;
const AUTO_SYNC_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;

type TryForegroundAutoSync = (args: {
  cancelled: () => boolean;
  setError(error: string | null): void;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setSyncProgress(progress: CompanionDesktopSyncProgress | null): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  state: NativeCompanionWorkspaceSyncState;
}) => Promise<ForegroundAutoSyncOutcome>;

function clearRetryTimer(retryTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (retryTimerRef.current) {
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }
}

function createForegroundSyncRunner(args: {
  cancelled: () => boolean;
  inFlightRef: MutableRefObject<boolean>;
  lastCheckedAtRef: MutableRefObject<number>;
  lastForegroundAtRef: MutableRefObject<number>;
  retryAttemptRef: MutableRefObject<number>;
  retryTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setError: (error: string | null) => void;
  setReadableArticle: (article: CompanionReadableArticle | null) => void;
  setState: (state: NativeCompanionWorkspaceSyncState) => void;
  setSyncProgress: (progress: CompanionDesktopSyncProgress | null) => void;
  setStatus: (status: CompanionWorkspaceSyncStatus) => void;
  stateRef: MutableRefObject<NativeCompanionWorkspaceSyncState>;
  tryForegroundAutoSync: TryForegroundAutoSync;
}) {
  function scheduleRetry(runForegroundSyncCheck: (reason: ForegroundSyncReason) => void) {
    if (args.cancelled() || args.retryTimerRef.current) return;
    const delayIndex = Math.min(args.retryAttemptRef.current, AUTO_SYNC_RETRY_DELAYS_MS.length - 1);
    const delay = AUTO_SYNC_RETRY_DELAYS_MS[delayIndex];
    args.retryAttemptRef.current += 1;
    args.retryTimerRef.current = setTimeout(() => {
      args.retryTimerRef.current = null;
      runForegroundSyncCheck('retry');
    }, delay);
  }

  const runForegroundSyncCheck = (reason: ForegroundSyncReason) => {
    if (args.inFlightRef.current) return;
    const state = args.stateRef.current;
    if (!resolveCompanionWorkspaceSyncEndpoint(state)) return;
    const now = Date.now();
    if (reason === 'foreground') {
      const elapsed = now - args.lastForegroundAtRef.current;
      if (elapsed >= 0 && elapsed < FOREGROUND_DUPLICATE_EVENT_WINDOW_MS) return;
      args.lastForegroundAtRef.current = now;
    }
    if (!shouldRunForegroundAutoSyncCheck({
      force: reason === 'foreground' || reason === 'retry',
      isNativeRuntime: isNativeAndroidCompanionRuntime(),
      lastCheckedAt: args.lastCheckedAtRef.current,
      now
    })) return;
    if (reason !== 'retry') {
      clearRetryTimer(args.retryTimerRef);
    }
    args.lastCheckedAtRef.current = now;
    args.inFlightRef.current = true;
    void args.tryForegroundAutoSync({
      cancelled: args.cancelled,
      setError: args.setError,
      setReadableArticle: args.setReadableArticle,
      setState: args.setState,
      setSyncProgress: args.setSyncProgress,
      setStatus: args.setStatus,
      state
    })
      .then((outcome) => {
        if (outcome === 'completed') {
          args.retryAttemptRef.current = 0;
          clearRetryTimer(args.retryTimerRef);
        } else {
          scheduleRetry(runForegroundSyncCheck);
        }
      })
      .catch(() => {
        scheduleRetry(runForegroundSyncCheck);
      })
      .finally(() => {
        args.inFlightRef.current = false;
      });
  };

  return runForegroundSyncCheck;
}

export function useForegroundAutoSync(
  setError: (error: string | null) => void,
  setReadableArticle: (article: CompanionReadableArticle | null) => void,
  setState: (state: NativeCompanionWorkspaceSyncState) => void,
  setSyncProgress: (progress: CompanionDesktopSyncProgress | null) => void,
  setStatus: (status: CompanionWorkspaceSyncStatus) => void,
  state: NativeCompanionWorkspaceSyncState,
  tryForegroundAutoSync: TryForegroundAutoSync
) {
  const inFlightRef = useRef(false);
  const lastCheckedAtRef = useRef(0);
  const lastForegroundAtRef = useRef(0);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runForegroundSyncCheckRef = useRef<(reason: ForegroundSyncReason) => void>(() => undefined);
  const stateRef = useRef(state);
  const endpointUrl = resolveCompanionWorkspaceSyncEndpoint(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    runForegroundSyncCheckRef.current('endpoint-ready');
  }, [endpointUrl]);

  useEffect(() => {
    let cancelled = false;
    const runForegroundSyncCheck = createForegroundSyncRunner({
      cancelled: () => cancelled,
      inFlightRef,
      lastCheckedAtRef,
      lastForegroundAtRef,
      retryAttemptRef,
      retryTimerRef,
      setError,
      setReadableArticle,
      setState,
      setSyncProgress,
      setStatus,
      stateRef,
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
      clearRetryTimer(retryTimerRef);
      unsubscribe?.();
    };
  }, [setError, setReadableArticle, setState, setStatus, tryForegroundAutoSync]);
}
