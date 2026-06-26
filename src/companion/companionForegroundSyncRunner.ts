import type { MutableRefObject } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { isNativeAndroidCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { shouldRunForegroundAutoSyncCheck } from './companionAutoSync';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';

export type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';
export type ForegroundAutoSyncOutcome = 'backlog' | 'completed' | 'failed' | 'skipped';
export type ForegroundSyncReason = 'endpoint-ready' | 'foreground' | 'retry';
export type CompanionSyncContinuationMode = 'full' | 'resources-only';
const FOREGROUND_DUPLICATE_EVENT_WINDOW_MS = 1_000;
const AUTO_SYNC_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;
const AUTO_SYNC_BACKLOG_CONTINUE_DELAY_MS = 1_000;
type RunForegroundSyncCheck = (reason: ForegroundSyncReason) => void;

export type TryForegroundAutoSync = (args: {
  cancelled: () => boolean;
  continuationMode?: CompanionSyncContinuationMode;
  onContinuationModeChange?(mode: CompanionSyncContinuationMode): void;
  setError(error: string | null): void;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setSyncProgress(progress: CompanionDesktopSyncProgress | null): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  state: NativeCompanionWorkspaceSyncState;
}) => Promise<ForegroundAutoSyncOutcome>;

type ForegroundSyncRunnerArgs = {
  cancelled: () => boolean;
  inFlightRef: MutableRefObject<boolean>;
  isPairingReadyRef: MutableRefObject<boolean>;
  lastCheckedAtRef: MutableRefObject<number>;
  lastForegroundAtRef: MutableRefObject<number>;
  resourceContinuationModeRef: MutableRefObject<CompanionSyncContinuationMode>;
  retryAttemptRef: MutableRefObject<number>;
  retryTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setError: (error: string | null) => void;
  setReadableArticle: (article: CompanionReadableArticle | null) => void;
  setState: (state: NativeCompanionWorkspaceSyncState) => void;
  setSyncProgress: (progress: CompanionDesktopSyncProgress | null) => void;
  setStatus: (status: CompanionWorkspaceSyncStatus) => void;
  stateRef: MutableRefObject<NativeCompanionWorkspaceSyncState>;
  tryForegroundAutoSync: TryForegroundAutoSync;
};

export type ForegroundSyncRefs = Pick<
  ForegroundSyncRunnerArgs,
  | 'inFlightRef'
  | 'isPairingReadyRef'
  | 'lastCheckedAtRef'
  | 'lastForegroundAtRef'
  | 'resourceContinuationModeRef'
  | 'retryAttemptRef'
  | 'retryTimerRef'
  | 'stateRef'
>;

export function clearRetryTimer(retryTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (retryTimerRef.current) {
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }
}

function scheduleRetry(
  args: ForegroundSyncRunnerArgs,
  runForegroundSyncCheck: RunForegroundSyncCheck,
  outcome: Exclude<ForegroundAutoSyncOutcome, 'completed'>
) {
  if (args.cancelled() || args.retryTimerRef.current) return;
  const delay = outcome === 'backlog'
    ? AUTO_SYNC_BACKLOG_CONTINUE_DELAY_MS
    : AUTO_SYNC_RETRY_DELAYS_MS[Math.min(args.retryAttemptRef.current, AUTO_SYNC_RETRY_DELAYS_MS.length - 1)];
  if (outcome === 'backlog') {
    args.retryAttemptRef.current = 0;
  } else {
    args.retryAttemptRef.current += 1;
  }
  args.retryTimerRef.current = setTimeout(() => {
    args.retryTimerRef.current = null;
    runForegroundSyncCheck('retry');
  }, delay);
}

function shouldStartForegroundSync(args: ForegroundSyncRunnerArgs, reason: ForegroundSyncReason, now: number) {
  if (!args.isPairingReadyRef.current) return false;
  if (!resolveCompanionWorkspaceSyncEndpoint(args.stateRef.current)) return false;
  if (reason === 'foreground') {
    const elapsed = now - args.lastForegroundAtRef.current;
    if (elapsed >= 0 && elapsed < FOREGROUND_DUPLICATE_EVENT_WINDOW_MS) return false;
    args.lastForegroundAtRef.current = now;
  }
  return shouldRunForegroundAutoSyncCheck({
    force: reason === 'foreground' || reason === 'retry',
    isNativeRuntime: isNativeAndroidCompanionRuntime(),
    lastCheckedAt: args.lastCheckedAtRef.current,
    now
  });
}

function startForegroundSync(
  args: ForegroundSyncRunnerArgs,
  runForegroundSyncCheck: RunForegroundSyncCheck,
  reason: ForegroundSyncReason,
  state: NativeCompanionWorkspaceSyncState
) {
  let retryOutcome: Exclude<ForegroundAutoSyncOutcome, 'completed' | 'skipped'> | null = null;
  args.inFlightRef.current = true;
  void args.tryForegroundAutoSync({
    cancelled: args.cancelled,
    continuationMode: reason === 'retry' ? args.resourceContinuationModeRef.current : 'full',
    onContinuationModeChange: (mode) => {
      args.resourceContinuationModeRef.current = mode;
    },
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
        args.resourceContinuationModeRef.current = 'full';
        clearRetryTimer(args.retryTimerRef);
      } else if (outcome === 'backlog' || outcome === 'failed') {
        retryOutcome = outcome;
        if (outcome === 'backlog') args.setStatus('syncing');
      } else {
        args.retryAttemptRef.current = 0;
        args.resourceContinuationModeRef.current = 'full';
        clearRetryTimer(args.retryTimerRef);
      }
    })
    .catch(() => {
      retryOutcome = 'failed';
    })
    .finally(() => {
      args.inFlightRef.current = false;
      if (retryOutcome) scheduleRetry(args, runForegroundSyncCheck, retryOutcome);
    });
}

export function createForegroundSyncRunner(args: ForegroundSyncRunnerArgs) {
  const runForegroundSyncCheck = (reason: ForegroundSyncReason) => {
    if (args.inFlightRef.current) {
      if (reason === 'retry') scheduleRetry(args, runForegroundSyncCheck, 'backlog');
      return;
    }
    const now = Date.now();
    if (!shouldStartForegroundSync(args, reason, now)) return;
    if (reason !== 'retry') clearRetryTimer(args.retryTimerRef);
    args.lastCheckedAtRef.current = now;
    startForegroundSync(args, runForegroundSyncCheck, reason, args.stateRef.current);
  };

  return runForegroundSyncCheck;
}
