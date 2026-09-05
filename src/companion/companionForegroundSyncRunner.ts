import type { MutableRefObject } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { SyncTriggerReason } from '../../lib/platform/syncTriggerContract';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { shouldRunForegroundAutoSyncCheck } from './companionAutoSync';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';

export type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';
export type ForegroundAutoSyncOutcome = 'backlog' | 'completed' | 'failed' | 'skipped';
export type ForegroundSyncReason = 'endpoint-ready' | 'foreground' | 'retry' | 'service-hint';
export type CompanionSyncContinuationMode = 'full' | 'resources-only';
const FOREGROUND_DUPLICATE_EVENT_WINDOW_MS = 1_000;
const AUTO_SYNC_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;
const AUTO_SYNC_BACKLOG_CONTINUE_DELAY_MS = 1_000;
type RunForegroundSyncCheck = (reason: ForegroundSyncReason, endpointUrl?: string) => void;
type ForegroundSyncDecision = 'deferred' | 'skipped' | 'started';

export type ForegroundSyncDecisionTrace = {
  decision: ForegroundSyncDecision;
  hasEndpoint: boolean;
  inFlight: boolean;
  isAppActive: boolean;
  isSyncGroupReady: boolean;
  reason: ForegroundSyncReason;
};

let decisionObserver: ((trace: ForegroundSyncDecisionTrace) => void) | null = null;

export function setForegroundSyncDecisionObserver(
  observer: ((trace: ForegroundSyncDecisionTrace) => void) | null
) {
  decisionObserver = observer;
}

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
  triggerReason: SyncTriggerReason;
}) => Promise<ForegroundAutoSyncOutcome>;

type ForegroundSyncRunnerArgs = {
  cancelled: () => boolean;
  inFlightRef: MutableRefObject<boolean>;
  isAppActiveRef: MutableRefObject<boolean>;
  isSyncGroupReadyRef: MutableRefObject<boolean>;
  lastCheckedAtRef: MutableRefObject<number>;
  lastForegroundAtRef: MutableRefObject<number>;
  pendingForegroundRef: MutableRefObject<boolean>;
  pendingServiceHintRef: MutableRefObject<Set<string>>;
  readAppActiveState: () => Promise<boolean>;
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
  | 'isAppActiveRef'
  | 'isSyncGroupReadyRef'
  | 'lastCheckedAtRef'
  | 'lastForegroundAtRef'
  | 'pendingForegroundRef'
  | 'pendingServiceHintRef'
  | 'readAppActiveState'
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
  if (args.cancelled() || !args.isAppActiveRef.current || args.retryTimerRef.current) return;
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
    void runRetryIfActive(args, runForegroundSyncCheck);
  }, delay);
}

async function runRetryIfActive(
  args: ForegroundSyncRunnerArgs,
  runForegroundSyncCheck: RunForegroundSyncCheck
) {
  const isActive = await args.readAppActiveState().catch(() => false);
  args.isAppActiveRef.current = isActive;
  if (!args.cancelled() && isActive) runForegroundSyncCheck('retry');
}

function shouldStartForegroundSync(args: ForegroundSyncRunnerArgs, reason: ForegroundSyncReason, now: number) {
  if (!args.isAppActiveRef.current) return false;
  if (!args.isSyncGroupReadyRef.current) return false;
  if (!resolveCompanionWorkspaceSyncEndpoint(args.stateRef.current)) return false;
  if (reason === 'foreground') {
    const elapsed = now - args.lastForegroundAtRef.current;
    if (elapsed >= 0 && elapsed < FOREGROUND_DUPLICATE_EVENT_WINDOW_MS) return false;
    args.lastForegroundAtRef.current = now;
  }
  return shouldRunForegroundAutoSyncCheck({
    force: reason === 'foreground' || reason === 'retry' || reason === 'service-hint',
    isNativeRuntime: isAvailableNativeCompanionRuntime(),
    lastCheckedAt: args.lastCheckedAtRef.current,
    now
  });
}

function startForegroundSync(
  args: ForegroundSyncRunnerArgs,
  runForegroundSyncCheck: RunForegroundSyncCheck,
  reason: ForegroundSyncReason,
  hintedEndpointUrl: string | undefined,
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
    state: reason === 'service-hint' && hintedEndpointUrl
      ? { ...state, endpoint_url: hintedEndpointUrl }
      : state,
    triggerReason: state.last_synced_at ? 'automatic' : 'initial'
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
      const pendingServiceHint = args.pendingServiceHintRef.current.values().next().value;
      if (pendingServiceHint) {
        args.pendingServiceHintRef.current.delete(pendingServiceHint);
        runForegroundSyncCheck('service-hint', pendingServiceHint);
      } else if (args.pendingForegroundRef.current) {
        args.pendingForegroundRef.current = false;
        runForegroundSyncCheck('foreground');
      } else if (retryOutcome) scheduleRetry(args, runForegroundSyncCheck, retryOutcome);
    });
}

export function createForegroundSyncRunner(args: ForegroundSyncRunnerArgs) {
  const runForegroundSyncCheck = (reason: ForegroundSyncReason, endpointUrl?: string) => {
    if (args.inFlightRef.current) {
      if (reason === 'service-hint' && endpointUrl) args.pendingServiceHintRef.current.add(endpointUrl);
      if (reason === 'foreground') args.pendingForegroundRef.current = true;
      if (reason === 'retry') scheduleRetry(args, runForegroundSyncCheck, 'backlog');
      emitDecision(args, reason, 'deferred');
      return;
    }
    const now = Date.now();
    if (!shouldStartForegroundSync(args, reason, now)) {
      emitDecision(args, reason, 'skipped');
      return;
    }
    emitDecision(args, reason, 'started');
    if (reason !== 'retry') clearRetryTimer(args.retryTimerRef);
    args.lastCheckedAtRef.current = now;
    startForegroundSync(args, runForegroundSyncCheck, reason, endpointUrl, args.stateRef.current);
  };

  return runForegroundSyncCheck;
}

function emitDecision(args: ForegroundSyncRunnerArgs, reason: ForegroundSyncReason, decision: ForegroundSyncDecision) {
  decisionObserver?.({
    decision,
    hasEndpoint: Boolean(resolveCompanionWorkspaceSyncEndpoint(args.stateRef.current)),
    inFlight: args.inFlightRef.current,
    isAppActive: args.isAppActiveRef.current,
    isSyncGroupReady: args.isSyncGroupReadyRef.current,
    reason
  });
}
