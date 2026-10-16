import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { SyncTriggerReason } from '../../lib/platform/syncTriggerContract';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { shouldRunForegroundAutoSyncCheck } from './companionAutoSync';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';

export type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';
export type ForegroundAutoSyncOutcome = 'backlog' | 'completed' | 'failed' | 'pending' | 'skipped';
export type ForegroundSyncReason =
  | 'endpoint-ready' | 'foreground' | 'freshness' | 'mutation' | 'retry';
export type CompanionSyncContinuationMode = 'full' | 'resources-only';
const FOREGROUND_DUPLICATE_EVENT_WINDOW_MS = 1_000;
const AUTO_SYNC_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;
const AUTO_SYNC_BACKLOG_CONTINUE_DELAY_MS = 1_000;
type RunForegroundSyncCheck = (reason: ForegroundSyncReason, endpointUrl?: string) => void;

export type TryForegroundAutoSync = (args: {
  cancelled: () => boolean;
  continuationMode?: CompanionSyncContinuationMode;
  onContinuationModeChange?(mode: CompanionSyncContinuationMode): void;
  setError(error: string | null): void;
  setState: Dispatch<SetStateAction<NativeCompanionWorkspaceSyncState>>;
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
  readAppActiveState: () => Promise<boolean>;
  resourceContinuationModeRef: MutableRefObject<CompanionSyncContinuationMode>;
  retryAttemptRef: MutableRefObject<number>;
  retryTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setError: (error: string | null) => void;
  setState: Dispatch<SetStateAction<NativeCompanionWorkspaceSyncState>>;
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

function shouldStartForegroundSync(
  args: ForegroundSyncRunnerArgs, reason: ForegroundSyncReason, now: number, endpointChanged: boolean
) {
  if (args.cancelled() || !args.isAppActiveRef.current) return false;
  if (!args.isSyncGroupReadyRef.current) return false;
  if (!resolveCompanionWorkspaceSyncEndpoint(args.stateRef.current)) return false;
  if (reason === 'foreground') {
    const elapsed = now - args.lastForegroundAtRef.current;
    if (elapsed >= 0 && elapsed < FOREGROUND_DUPLICATE_EVENT_WINDOW_MS) return false;
    args.lastForegroundAtRef.current = now;
  }
  return shouldRunForegroundAutoSyncCheck({
    force: endpointChanged || reason !== 'endpoint-ready',
    isNativeRuntime: isAvailableNativeCompanionRuntime(),
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
  const work = args.tryForegroundAutoSync({
    cancelled: args.cancelled,
    continuationMode: reason === 'retry' ? args.resourceContinuationModeRef.current : 'full',
    onContinuationModeChange: (mode) => {
      args.resourceContinuationModeRef.current = mode;
    },
    setError: args.setError,
    setState: args.setState,
    setSyncProgress: args.setSyncProgress,
    setStatus: args.setStatus,
    state,
    triggerReason: state.last_synced_at ? 'automatic' : 'initial'
  })
    .then((outcome) => {
      if (outcome === 'completed') {
        args.retryAttemptRef.current = 0;
        args.resourceContinuationModeRef.current = 'full';
        clearRetryTimer(args.retryTimerRef);
      } else if (outcome === 'backlog' || outcome === 'failed' || outcome === 'pending') {
        if (!args.isSyncGroupReadyRef.current) {
          args.retryAttemptRef.current = 0;
          args.resourceContinuationModeRef.current = 'full';
          clearRetryTimer(args.retryTimerRef);
          return;
        }
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
  return work;
}

export function createForegroundSyncRunner(args: ForegroundSyncRunnerArgs) {
  const attemptedEndpoints = new Set(args.stateRef.current.remembered_targets);
  const initialEndpoint = resolveCompanionWorkspaceSyncEndpoint(args.stateRef.current);
  if (initialEndpoint) attemptedEndpoints.add(initialEndpoint);
  let pendingEndpoint: string | null = null;
  let pendingMutation = false;
  const syncArgs: ForegroundSyncRunnerArgs = { ...args, setState(update) {
    const state = typeof update === 'function' ? update(args.stateRef.current) : update;
    const endpoint = resolveCompanionWorkspaceSyncEndpoint(state);
    if (endpoint) attemptedEndpoints.add(endpoint);
    args.setState(update);
  } };
  const runForegroundSyncCheck = (reason: ForegroundSyncReason): Promise<void> | null => {
    const endpoint = resolveCompanionWorkspaceSyncEndpoint(args.stateRef.current);
    if (reason === 'endpoint-ready' && endpoint && !attemptedEndpoints.has(endpoint)) pendingEndpoint = endpoint;
    if (args.inFlightRef.current) {
      if (reason === 'mutation') pendingMutation = true;
      if (reason === 'retry') scheduleRetry(args, runForegroundSyncCheck, 'pending');
      return null;
    }
    const endpointChanged = pendingEndpoint !== null && pendingEndpoint === endpoint;
    if (args.retryTimerRef.current && !endpointChanged
      && (reason === 'freshness' || reason === 'endpoint-ready')) return null;
    const now = Date.now();
    if (!shouldStartForegroundSync(args, reason, now, endpointChanged)) return null;
    if (reason !== 'retry') clearRetryTimer(args.retryTimerRef);
    if (endpointChanged) args.retryAttemptRef.current = 0;
    pendingEndpoint = null;
    if (endpoint) attemptedEndpoints.add(endpoint);
    args.lastCheckedAtRef.current = now;
    pendingMutation = false;
    return startForegroundSync(syncArgs, runForegroundSyncCheck, reason, args.stateRef.current).finally(() => {
      if (pendingMutation && !args.cancelled()) return runForegroundSyncCheck('mutation') ?? undefined;
      if (pendingEndpoint && !args.cancelled()) return runForegroundSyncCheck('endpoint-ready') ?? undefined;
    });
  };

  return runForegroundSyncCheck;
}
