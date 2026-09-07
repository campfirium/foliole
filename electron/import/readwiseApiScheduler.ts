import type { ReadwiseSyncFrequency } from '../../lib/core/import/readwiseReaderSettings.js';
import type { NativeReadwiseApiScheduleStatus } from '../../lib/platform/nativeReadwiseApiImportContract.js';
import { loadReadwiseApiCompletedThrough } from '../database/readwiseApiImportState.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { notifyWorkspaceContentChanged } from '../ipc/workspaceContentChangedEvents.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { isStoredReadwiseApiConnectionReady } from './readwiseApiConnectionState.js';
import { cancelReadwiseApiImport, runReadwiseApiImport } from './readwiseApiImportRun.js';
import {
  isReadwiseApiTrackedRunActive,
  loadReadwiseApiScheduleState,
  saveReadwiseApiNextRun
} from './readwiseApiScheduleState.js';

const INTERVAL_MS: Record<ReadwiseSyncFrequency, number> = {
  daily: 86_400_000,
  every_12_hours: 43_200_000,
  hourly: 3_600_000,
  weekly: 604_800_000
};

interface SchedulerDependencies {
  cancelImport: typeof cancelReadwiseApiImport;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
  loadConnectionReady: typeof isStoredReadwiseApiConnectionReady;
  loadCompletedThrough: typeof loadReadwiseApiCompletedThrough;
  loadHostAssignment: typeof loadReadwiseHostAssignment;
  loadScheduleState: typeof loadReadwiseApiScheduleState;
  loadSettings: typeof loadImportManagerSettings;
  loadSource: typeof loadReadwiseRemoteSource;
  now: () => number;
  notifyChanged: () => void;
  runImport: typeof runReadwiseApiImport;
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  saveNextRun: typeof saveReadwiseApiNextRun;
  trackedRunActive: typeof isReadwiseApiTrackedRunActive;
}

type Eligibility = ReturnType<typeof resolveEligibility>;

export function createReadwiseApiScheduler(dependencies: SchedulerDependencies) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;
  let lastSignature: string | null = null;
  function stop() {
    generation += 1;
    if (timer !== null) dependencies.clearTimeout(timer);
    timer = null;
  }

  function refresh(startup = false) {
    stop();
    const eligibility = resolveEligibility(dependencies);
    const signature = eligibilitySignature(eligibility);
    if (lastSignature && lastSignature !== signature) dependencies.cancelImport();
    lastSignature = signature;
    if (eligibility.status !== 'ready') return;
    const state = dependencies.loadScheduleState(eligibility.connectionRef);
    const base = state.lastResult?.completed_at ?? eligibility.completedThrough;
    const nextAt = Date.parse(base) + INTERVAL_MS[eligibility.frequency];
    const delay = Math.max(0, nextAt - dependencies.now());
    dependencies.saveNextRun(eligibility.connectionRef, new Date(nextAt).toISOString());
    schedule(eligibility, delay, startup && delay === 0 ? 'startup' : 'scheduled');
  }

  function schedule(
    eligibility: Extract<Eligibility, { status: 'ready' }>,
    delay: number,
    trigger: 'scheduled' | 'startup'
  ) {
    const scheduledGeneration = generation;
    timer = dependencies.setTimeout(() => {
      timer = null;
      if (scheduledGeneration !== generation || !sameEligibility(eligibility, resolveEligibility(dependencies))) return;
      void dependencies.runImport({ trigger }).then((result) => {
        if ((result.imported_count ?? result.committed_count ?? 0) > 0) dependencies.notifyChanged();
      }).catch(() => undefined).finally(() => {
        if (scheduledGeneration === generation) refresh(false);
      });
    }, delay);
  }

  function loadStatus(): NativeReadwiseApiScheduleStatus {
    return buildScheduleStatus(dependencies);
  }

  return { loadStatus, refresh, stop };
}

function buildScheduleStatus(dependencies: SchedulerDependencies): NativeReadwiseApiScheduleStatus {
  const eligibility = resolveEligibility(dependencies);
  if (eligibility.status !== 'ready') {
    const connectionRef = 'connectionRef' in eligibility ? eligibility.connectionRef : null;
    const state = connectionRef ? dependencies.loadScheduleState(connectionRef) : null;
    return {
      eligibility: eligibility.status,
      last_result: state?.lastResult ?? null,
      next_run_at: null,
      running: connectionRef ? dependencies.trackedRunActive(connectionRef) : false
    };
  }
  const state = dependencies.loadScheduleState(eligibility.connectionRef);
  return {
    eligibility: 'ready',
    last_result: state.lastResult,
    next_run_at: state.nextRunAt,
    running: dependencies.trackedRunActive(eligibility.connectionRef)
  };
}

function resolveEligibility(dependencies: SchedulerDependencies) {
  const settings = dependencies.loadSettings();
  if (settings.readwiseSourceMode !== 'api') return { status: 'source_mode_mismatch' as const };
  const assignment = dependencies.loadHostAssignment();
  if (!assignment.is_active) return { status: 'inactive_host' as const };
  const source = dependencies.loadSource();
  if (!source) return { status: 'connection_required' as const };
  if (!dependencies.loadConnectionReady()) {
    return { connectionRef: source.connectionRef, status: 'connection_required' as const };
  }
  const completedThrough = dependencies.loadCompletedThrough(source.connectionRef);
  if (!completedThrough) return { connectionRef: source.connectionRef, status: 'first_import_required' as const };
  return {
    activeHost: assignment.current_host_name,
    completedThrough,
    connectionRef: source.connectionRef,
    frequency: settings.readwiseReaderConfig.syncFrequency,
    status: 'ready' as const
  };
}

function eligibilitySignature(eligibility: Eligibility) {
  return eligibility.status === 'ready'
    ? `${eligibility.status}:${eligibility.activeHost}:${eligibility.connectionRef}`
    : eligibility.status;
}

function sameEligibility(previous: Extract<Eligibility, { status: 'ready' }>, current: Eligibility) {
  return current.status === 'ready'
    && previous.activeHost === current.activeHost
    && previous.connectionRef === current.connectionRef;
}

const scheduler = createReadwiseApiScheduler({
  cancelImport: cancelReadwiseApiImport,
  clearTimeout,
  loadConnectionReady: isStoredReadwiseApiConnectionReady,
  loadCompletedThrough: loadReadwiseApiCompletedThrough,
  loadHostAssignment: loadReadwiseHostAssignment,
  loadScheduleState: loadReadwiseApiScheduleState,
  loadSettings: loadImportManagerSettings,
  loadSource: loadReadwiseRemoteSource,
  now: Date.now,
  notifyChanged: notifyWorkspaceContentChanged,
  runImport: runReadwiseApiImport,
  saveNextRun: saveReadwiseApiNextRun,
  setTimeout,
  trackedRunActive: isReadwiseApiTrackedRunActive
});

export const loadReadwiseApiScheduleStatus = scheduler.loadStatus;
export const refreshReadwiseApiScheduler = scheduler.refresh;
export const startReadwiseApiScheduler = () => scheduler.refresh(true);
export const stopReadwiseApiScheduler = scheduler.stop;
