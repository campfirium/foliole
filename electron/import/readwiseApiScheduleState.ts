import type { NativeReadwiseImportRunResult } from '../../lib/platform/nativeImportContract.js';
import type {
  NativeReadwiseApiRunKind,
  NativeReadwiseApiRunLifecycle,
  NativeReadwiseApiRunStage,
  NativeReadwiseApiRunTrigger,
  NativeReadwiseApiScheduleResult,
  NativeReadwiseApiTaskProgress
} from '../../lib/platform/nativeReadwiseApiImportContract.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

import {
  isRecord,
  normalizeReadwiseApiRunLifecycle,
  normalizeReadwiseApiScheduleResult,
  normalizeReadwiseApiTaskProgress
} from './readwiseApiScheduleStateCodec.js';

const SCHEDULE_STATE_KEY = 'readwise_api_schedule_state';

export interface StoredReadwiseApiScheduleState {
  connectionRef: string;
  initialProgress: NativeReadwiseApiTaskProgress | null;
  lastResult: NativeReadwiseApiScheduleResult | null;
  lifecycle: NativeReadwiseApiRunLifecycle | null;
  nextRunAt: string | null;
  version: 2;
}

let activeRun: { connectionRef: string; runId: string } | null = null;

export function loadReadwiseApiScheduleState(connectionRef: string): StoredReadwiseApiScheduleState {
  const value = loadJsonSetting(SCHEDULE_STATE_KEY);
  if (!isRecord(value) || value.connectionRef !== connectionRef) return emptyState(connectionRef);
  if (value.version !== 1 && value.version !== 2) {
    throw new Error(`readwise_api_schedule_state_unknown_version:${String(value.version)}`);
  }
  return {
    connectionRef,
    initialProgress: normalizeReadwiseApiTaskProgress(value.initialProgress),
    lastResult: normalizeReadwiseApiScheduleResult(value.lastResult),
    lifecycle: normalizeReadwiseApiRunLifecycle(value.lifecycle),
    nextRunAt: typeof value.nextRunAt === 'string' ? value.nextRunAt : null,
    version: 2
  };
}

export function saveReadwiseApiNextRun(connectionRef: string, nextRunAt: string | null) {
  saveState({ ...loadReadwiseApiScheduleState(connectionRef), nextRunAt });
}

export function queueReadwiseApiTrackedRun(input: {
  connectionRef: string;
  kind: NativeReadwiseApiRunKind;
  queuedAt: string;
  trigger: NativeReadwiseApiRunTrigger;
}) {
  const current = loadReadwiseApiScheduleState(input.connectionRef);
  if (current.lifecycle?.status === 'queued'
    && current.lifecycle.kind === input.kind
    && current.lifecycle.queued_at === input.queuedAt) return;
  saveState({ ...current, lifecycle: createLifecycle(input, 'queued') });
}

export function beginReadwiseApiTrackedRun(
  connectionRef: string,
  trigger: NativeReadwiseApiRunTrigger,
  kind: NativeReadwiseApiRunKind,
  now = new Date().toISOString()
) {
  if (activeRun) throw new Error('readwise_api_run_owner_conflict');
  const current = loadReadwiseApiScheduleState(connectionRef);
  const queued = current.lifecycle?.status === 'queued'
    && current.lifecycle.kind === kind ? current.lifecycle : null;
  const lifecycle: NativeReadwiseApiRunLifecycle = queued ? {
    ...queued, stage: 'eligibility', started_at: now, status: 'running', trigger
  } : {
    ...createLifecycle({ kind, queuedAt: now, trigger }, 'running'), started_at: now
  };
  activeRun = { connectionRef, runId: lifecycle.run_id };
  saveState({ ...current, lifecycle });
}

export function updateReadwiseApiTrackedRunStage(stage: NativeReadwiseApiRunStage) {
  if (!activeRun) return;
  const current = loadReadwiseApiScheduleState(activeRun.connectionRef);
  if (current.lifecycle?.run_id !== activeRun.runId || current.lifecycle.status !== 'running') return;
  saveState({ ...current, lifecycle: { ...current.lifecycle, stage } });
}

export function updateReadwiseApiTrackedRunProgress(
  completedCount: number,
  totalCount: number,
  failedCount = 0,
  unexplainedFailureCount = 0
) {
  if (!activeRun) return;
  const current = loadReadwiseApiScheduleState(activeRun.connectionRef);
  if (current.lifecycle?.run_id !== activeRun.runId || current.lifecycle.status !== 'running') return;
  saveState({
    ...current,
    lifecycle: {
      ...current.lifecycle,
      progress: {
        completed_count: completedCount,
        failed_count: failedCount,
        pending_count: Math.max(0, totalCount - completedCount - failedCount),
        total_count: totalCount,
        unexplained_failure_count: unexplainedFailureCount
      }
    }
  });
}

export function completeReadwiseApiTrackedRun(
  connectionRef: string,
  result: NativeReadwiseImportRunResult,
  now = result.completed_at
) {
  const current = loadReadwiseApiScheduleState(connectionRef);
  const lastResult: NativeReadwiseApiScheduleResult = {
    completed_at: result.completed_at,
    error_stage: result.status === 'failed' ? current.lifecycle?.stage ?? 'eligibility' : null,
    imported_count: result.imported_count ?? result.committed_count ?? 0,
    status: result.status,
    trigger: current.lifecycle?.trigger ?? 'manual'
  };
  const remainingCount = result.remaining_count ?? result.failed_count;
  const progress = {
    completed_count: Math.max(0, result.source_count - remainingCount),
    failed_count: result.failed_count,
    pending_count: Math.max(0, remainingCount - result.failed_count),
    total_count: result.source_count,
    unexplained_failure_count: current.lifecycle?.progress?.unexplained_failure_count ?? 0
  };
  const completedState = current.lifecycle
    ? {
      ...current,
      initialProgress: current.lifecycle.kind === 'initial' && result.status === 'completed'
        ? progress : current.initialProgress,
      lifecycle: { ...current.lifecycle, progress }
    } : current;
  finishRun(completedState, result.status === 'failed' ? 'failed'
    : result.status === 'cancelled' || result.status === 'paused' ? 'interrupted' : 'completed',
  lastResult, null, now);
}

export function failReadwiseApiTrackedRun(connectionRef: string, error?: unknown, now = new Date().toISOString()) {
  const current = loadReadwiseApiScheduleState(connectionRef);
  const stage = current.lifecycle?.stage ?? 'eligibility';
  const lastResult: NativeReadwiseApiScheduleResult = {
    completed_at: now, error_stage: stage, imported_count: 0,
    status: 'failed', trigger: current.lifecycle?.trigger ?? 'manual'
  };
  finishRun(current, 'failed', lastResult, safeFailureReason(error), now);
}

export function recoverInterruptedReadwiseApiRun(connectionRef: string, now = new Date().toISOString()) {
  activeRun = null;
  const current = loadReadwiseApiScheduleState(connectionRef);
  if (current.lifecycle?.status !== 'running') return current;
  const next = {
    ...current,
    lifecycle: { ...current.lifecycle, error_reason: null, finished_at: now, status: 'interrupted' as const }
  };
  saveState(next);
  return next;
}

export function isReadwiseApiTrackedRunActive(connectionRef: string) {
  if (activeRun?.connectionRef !== connectionRef) return false;
  const lifecycle = loadReadwiseApiScheduleState(connectionRef).lifecycle;
  return lifecycle?.run_id === activeRun.runId && lifecycle.status === 'running';
}

function finishRun(
  current: StoredReadwiseApiScheduleState,
  status: 'completed' | 'failed' | 'interrupted',
  lastResult: NativeReadwiseApiScheduleResult,
  errorReason: string | null,
  now: string
) {
  const lifecycle = current.lifecycle ? {
    ...current.lifecycle,
    error_reason: errorReason,
    finished_at: now,
    status
  } : null;
  saveState({ ...current, lastResult, lifecycle });
  activeRun = null;
}

function createLifecycle(
  input: { kind: NativeReadwiseApiRunKind; queuedAt: string; trigger: NativeReadwiseApiRunTrigger },
  status: 'queued' | 'running'
): NativeReadwiseApiRunLifecycle {
  return {
    error_reason: null, finished_at: null, kind: input.kind, progress: null, queued_at: input.queuedAt,
    run_id: `${Date.parse(input.queuedAt) || Date.now()}-${Math.random().toString(36).slice(2)}`,
    stage: 'eligibility', started_at: null, status, trigger: input.trigger
  };
}

function saveState(state: StoredReadwiseApiScheduleState) {
  saveJsonSetting(SCHEDULE_STATE_KEY, state);
}

function emptyState(connectionRef: string): StoredReadwiseApiScheduleState {
  return {
    connectionRef, initialProgress: null, lastResult: null, lifecycle: null, nextRunAt: null, version: 2
  };
}

function safeFailureReason(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message.startsWith('readwise_api_rate_limited:')) return 'rate_limited';
  return error.message.startsWith('readwise_') ? error.message : 'request_failed';
}
