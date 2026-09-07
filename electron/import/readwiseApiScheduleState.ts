import type { NativeReadwiseImportRunResult } from '../../lib/platform/nativeImportContract.js';
import type {
  NativeReadwiseApiRunStage,
  NativeReadwiseApiRunTrigger,
  NativeReadwiseApiScheduleResult
} from '../../lib/platform/nativeReadwiseApiImportContract.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

const SCHEDULE_STATE_KEY = 'readwise_api_schedule_state';

interface StoredReadwiseApiScheduleState {
  connectionRef: string;
  lastResult: NativeReadwiseApiScheduleResult | null;
  nextRunAt: string | null;
  version: 1;
}

let activeRun: { connectionRef: string; stage: NativeReadwiseApiRunStage; trigger: NativeReadwiseApiRunTrigger } | null = null;

export function loadReadwiseApiScheduleState(connectionRef: string): StoredReadwiseApiScheduleState {
  const value = loadJsonSetting(SCHEDULE_STATE_KEY);
  if (!isRecord(value) || value.connectionRef !== connectionRef) return emptyState(connectionRef);
  return {
    connectionRef,
    lastResult: normalizeResult(value.lastResult),
    nextRunAt: typeof value.nextRunAt === 'string' ? value.nextRunAt : null,
    version: 1
  };
}

export function saveReadwiseApiNextRun(connectionRef: string, nextRunAt: string | null) {
  const current = loadReadwiseApiScheduleState(connectionRef);
  saveState({ ...current, nextRunAt });
}

export function beginReadwiseApiTrackedRun(connectionRef: string, trigger: NativeReadwiseApiRunTrigger) {
  activeRun = { connectionRef, stage: 'eligibility', trigger };
}

export function updateReadwiseApiTrackedRunStage(stage: NativeReadwiseApiRunStage) {
  if (activeRun) activeRun.stage = stage;
}

export function completeReadwiseApiTrackedRun(
  connectionRef: string,
  result: NativeReadwiseImportRunResult
) {
  const trigger = activeRun?.connectionRef === connectionRef ? activeRun.trigger : 'manual';
  saveResult(connectionRef, {
    completed_at: result.completed_at,
    error_stage: null,
    imported_count: result.imported_count ?? result.committed_count ?? 0,
    status: result.status,
    trigger
  });
  activeRun = null;
}

export function failReadwiseApiTrackedRun(connectionRef: string) {
  const run = activeRun?.connectionRef === connectionRef ? activeRun : null;
  saveResult(connectionRef, {
    completed_at: new Date().toISOString(),
    error_stage: run?.stage ?? 'eligibility',
    imported_count: 0,
    status: 'failed',
    trigger: run?.trigger ?? 'manual'
  });
  activeRun = null;
}

export function isReadwiseApiTrackedRunActive(connectionRef: string) {
  return activeRun?.connectionRef === connectionRef;
}

function saveResult(connectionRef: string, lastResult: NativeReadwiseApiScheduleResult) {
  const current = loadReadwiseApiScheduleState(connectionRef);
  saveState({ ...current, lastResult });
}

function saveState(state: StoredReadwiseApiScheduleState) {
  saveJsonSetting(SCHEDULE_STATE_KEY, state);
}

function emptyState(connectionRef: string): StoredReadwiseApiScheduleState {
  return { connectionRef, lastResult: null, nextRunAt: null, version: 1 };
}

function normalizeResult(value: unknown): NativeReadwiseApiScheduleResult | null {
  if (!isRecord(value)) return null;
  const statuses = ['cancelled', 'completed', 'failed', 'paused'];
  const triggers = ['manual', 'scheduled', 'startup'];
  const stages = ['eligibility', 'fetching', 'writing', 'completion'];
  if (!statuses.includes(String(value.status)) || !triggers.includes(String(value.trigger))) return null;
  return {
    completed_at: typeof value.completed_at === 'string' ? value.completed_at : new Date(0).toISOString(),
    error_stage: stages.includes(String(value.error_stage)) ? value.error_stage as NativeReadwiseApiRunStage : null,
    imported_count: typeof value.imported_count === 'number' ? value.imported_count : 0,
    status: value.status as NativeReadwiseApiScheduleResult['status'],
    trigger: value.trigger as NativeReadwiseApiRunTrigger
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
