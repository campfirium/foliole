import { useEffect, useRef, type MutableRefObject } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { isNativeAndroidCompanionRuntime } from '../shared/platform/companionWorkspaceSyncBridge';

import { shouldRunForegroundAutoSyncCheck } from './companionAutoSync';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';

type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';
type ForegroundSyncReason = 'endpoint-ready' | 'foreground';
const FOREGROUND_DUPLICATE_EVENT_WINDOW_MS = 1_000;

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
  lastForegroundAtRef: MutableRefObject<number>;
  setError: (error: string | null) => void;
  setReadableArticle: (article: CompanionReadableArticle | null) => void;
  setState: (state: NativeCompanionWorkspaceSyncState) => void;
  setStatus: (status: CompanionWorkspaceSyncStatus) => void;
  stateRef: MutableRefObject<NativeCompanionWorkspaceSyncState>;
  tryForegroundAutoSync: TryForegroundAutoSync;
}) {
  return (reason: ForegroundSyncReason) => {
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
      force: reason === 'foreground',
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
      state
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
  const lastForegroundAtRef = useRef(0);
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
      setError,
      setReadableArticle,
      setState,
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
      unsubscribe?.();
    };
  }, [setError, setReadableArticle, setState, setStatus, tryForegroundAutoSync]);
}
