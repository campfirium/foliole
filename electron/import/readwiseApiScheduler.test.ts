import { beforeEach, expect, it, vi } from 'vitest';

import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import type { NativeReadwiseApiScheduleResult } from '../../lib/platform/nativeReadwiseApiImportContract.js';
import type {
  NativeReadwiseApiRunLifecycle,
  NativeReadwiseApiTaskProgress
} from '../../lib/platform/nativeReadwiseApiImportContract.js';

import { createReadwiseApiScheduler } from './readwiseApiScheduler.js';

const NOW = Date.parse('2026-09-08T12:00:00.000Z');
const CUTOVER = {
  completedAt: '2026-09-08T00:00:00.000Z', completedCandidateCount: 31,
  migratedCount: 30, sourceHost: 'Mac', startedAt: '2026-09-08T00:00:00.000Z',
  status: 'api' as const, totalCandidateCount: 31, unmatchedCount: 1, version: 1 as const
};
const SOURCE = {
  connectionRef: 'connection-one', createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z', version: 1 as const
};
const HOST_ASSIGNMENT = {
  active_host_name: 'Mac', current_host_name: 'Mac', hosts: [], legacy_unassigned: false
};

function updateCandidateProgress(progress: ReturnType<typeof candidateProgress>, completed: number, total: number, failed = 0) {
  progress.completedCount = completed;
  progress.failedCount = failed;
  progress.pendingCount = total - completed - failed;
  progress.totalCount = total;
  progress.unexplainedFailureCount = failed;
}

function candidateProgress() {
  return { completedCount: 31, failedCount: 0, pendingCount: 0, totalCount: 31, unexplainedFailureCount: 0 };
}

function importRunner() {
  return vi.fn().mockResolvedValue({
    completed_at: '2026-09-08T12:30:00.000Z', failed_count: 0,
    imported_count: 1, source_count: 1, status: 'completed'
  });
}

function createHarness() {
  let callback: (() => void) | null = null;
  let connectionRef = 'connection-one';
  let completedThrough: string | null = '2026-09-08T11:30:00.000Z';
  let sourceMode: 'api' | 'folder' = 'api';
  const progress = candidateProgress();
  let lastResult: NativeReadwiseApiScheduleResult | null = null;
  let lifecycle: NativeReadwiseApiRunLifecycle | null = null;
  let initialProgress: NativeReadwiseApiTaskProgress | null = null;
  let active = true;
  const cancelImport = vi.fn(() => ({ status: 'cancelled' as const }));
  const runImport = importRunner();
  const saveNextRun = vi.fn();
  const dependencies = {
    cancelImport,
    clearTimeout: vi.fn(),
    loadConnectionReady: vi.fn(() => true),
    loadCandidateProgress: vi.fn(() => progress),
    loadCompletedThrough: vi.fn(() => completedThrough),
    loadCutover: vi.fn(() => CUTOVER),
    loadHostAssignment: vi.fn(() => ({ ...HOST_ASSIGNMENT, is_active: active })),
    loadScheduleState: vi.fn(() => ({
      connectionRef, initialProgress, lastResult, lifecycle, nextRunAt: null, version: 2 as const
    })),
    loadSettings: vi.fn(() => ({
      ...createDefaultImportManagerSettings(), readwiseSourceMode: sourceMode
    })),
    loadSource: vi.fn(() => ({ ...SOURCE, connectionRef })),
    now: () => NOW,
    notifyChanged: vi.fn(),
    queueRun: vi.fn(),
    recoverRun: vi.fn(),
    runImport,
    saveNextRun,
    setTimeout: vi.fn((next: () => void) => {
      callback = next;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }),
    trackedRunActive: vi.fn(() => false)
  };
  const scheduler = createReadwiseApiScheduler(dependencies);
  return {
    cancelImport,
    dependencies,
    fire: async () => { callback?.(); await Promise.resolve(); await Promise.resolve(); },
    runImport,
    saveNextRun,
    scheduler,
    setActive: (value: boolean) => { active = value; },
    setCompletedThrough: (value: string | null) => { completedThrough = value; },
    setConnectionRef: (value: string) => { connectionRef = value; },
    setLastResult: (value: typeof lastResult) => { lastResult = value; },
    setInitialProgress: (value: typeof initialProgress) => { initialProgress = value; },
    setLifecycle: (value: typeof lifecycle) => { lifecycle = value; },
    setCandidateProgress: (completed: number, total: number, failed = 0) =>
      updateCandidateProgress(progress, completed, total, failed),
    setSourceMode: (value: 'api' | 'folder') => { sourceMode = value; }
  };
}

beforeEach(() => vi.clearAllMocks());

it('starts the first API import immediately after the mode and connection are ready', async () => {
  const harness = createHarness();
  harness.setCompletedThrough(null);
  harness.setCandidateProgress(29, 31, 2);
  harness.scheduler.refresh();

  expect(harness.dependencies.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
  expect(harness.scheduler.loadStatus().eligibility).toBe('ready');
  expect(harness.scheduler.loadStatus().initial_sync).toMatchObject({
    completed_count: 29, failed_count: 2, status: 'failed', total_count: 31
  });
  await harness.fire();
  expect(harness.runImport).toHaveBeenCalledWith({ trigger: 'scheduled' });
});

it('never reports a persisted running state without the current worker owner', () => {
  const harness = createHarness();
  harness.setCompletedThrough(null);
  harness.setCandidateProgress(29, 31, 2);
  harness.setLifecycle({
    error_reason: null, finished_at: null, kind: 'initial', queued_at: '2026-09-08T11:00:00.000Z',
    progress: null, run_id: 'stale-run', stage: 'writing', started_at: '2026-09-08T11:00:01.000Z',
    status: 'running', trigger: 'startup'
  });

  expect(harness.scheduler.loadStatus().initial_sync.status).toBe('interrupted');
});

it('does not resume an interrupted first sync after its candidate ledger is missing', () => {
  const harness = createHarness();
  harness.setCompletedThrough(null);
  harness.setCandidateProgress(0, 0);
  harness.setLifecycle({
    error_reason: null, finished_at: '2026-09-08T11:01:00.000Z', kind: 'initial',
    progress: null, queued_at: '2026-09-08T11:00:00.000Z', run_id: 'interrupted-run',
    stage: 'writing', started_at: '2026-09-08T11:00:01.000Z', status: 'interrupted', trigger: 'startup'
  });

  harness.scheduler.refresh(true);

  expect(harness.dependencies.setTimeout).not.toHaveBeenCalled();
});

it('recovers a stale worker on startup even when this host is inactive', () => {
  const harness = createHarness();
  harness.setCompletedThrough(null);
  harness.setCandidateProgress(29, 31, 2);
  harness.setActive(false);

  harness.scheduler.refresh(true);

  expect(harness.dependencies.recoverRun).toHaveBeenCalledWith('connection-one');
  expect(harness.dependencies.setTimeout).not.toHaveBeenCalled();
  expect(harness.scheduler.loadStatus().initial_sync).toMatchObject({
    completed_count: 29, failed_count: 2, status: 'failed', total_count: 31
  });
});

it('resumes an interrupted first import immediately on the next startup', () => {
  const harness = createHarness();
  harness.setCompletedThrough(null);
  harness.setLastResult({
    completed_at: '2026-09-08T11:45:00.000Z',
    error_stage: 'writing',
    imported_count: 29,
    status: 'failed',
    trigger: 'startup'
  });

  harness.scheduler.refresh(true);

  expect(harness.dependencies.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
});

it('does not spin on an incomplete first import after a failed run', () => {
  const harness = createHarness();
  harness.setCompletedThrough(null);
  harness.setLastResult({
    completed_at: '2026-09-08T11:45:00.000Z',
    error_stage: 'writing',
    imported_count: 29,
    status: 'failed',
    trigger: 'startup'
  });

  harness.scheduler.refresh(false);

  expect(harness.dependencies.setTimeout).toHaveBeenCalledWith(expect.any(Function), 2_700_000);
});

it('schedules one incremental run from the completed watermark', async () => {
  const harness = createHarness();
  harness.scheduler.refresh();

  expect(harness.dependencies.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1_800_000);
  expect(harness.saveNextRun).toHaveBeenCalledWith('connection-one', '2026-09-08T12:30:00.000Z');
  expect(harness.scheduler.loadStatus().initial_sync.status).toBe('completed');
  await harness.fire();
  expect(harness.runImport).toHaveBeenCalledWith({ trigger: 'scheduled' });
});

it('keeps the completed first-sync watermark while a routine run is queued', () => {
  const harness = createHarness();
  harness.setCandidateProgress(0, 0);
  harness.setInitialProgress({
    completed_count: 31, failed_count: 0, pending_count: 0,
    total_count: 31, unexplained_failure_count: 0
  });
  harness.setLifecycle({
    error_reason: null, finished_at: null, kind: 'routine', progress: null,
    queued_at: '2026-09-08T12:30:00.000Z', run_id: 'routine-run', stage: 'eligibility',
    started_at: null, status: 'queued', trigger: 'scheduled'
  });

  expect(harness.scheduler.loadStatus().initial_sync).toMatchObject({
    completed_count: 31, failed_count: 0, status: 'completed', total_count: 31
  });
});

it('keeps cutover and initial candidate progress independent', () => {
  const harness = createHarness();
  harness.setCompletedThrough(null);
  harness.setCandidateProgress(29, 31, 2);

  expect(harness.scheduler.loadStatus().cutover).toMatchObject({
    completed_count: 31, status: 'completed', total_count: 31
  });
  expect(harness.scheduler.loadStatus().initial_sync).toMatchObject({
    completed_count: 29, failed_count: 2, status: 'failed', total_count: 31
  });
});

it('runs an overdue import once at startup', async () => {
  const harness = createHarness();
  harness.setCompletedThrough('2026-09-08T10:00:00.000Z');
  harness.scheduler.refresh(true);
  await harness.fire();

  expect(harness.runImport).toHaveBeenCalledWith({ trigger: 'startup' });
});

it('cancels and invalidates old work after mode, host, or connection changes', async () => {
  const harness = createHarness();
  harness.scheduler.refresh();
  harness.setConnectionRef('connection-two');
  harness.scheduler.refresh();
  expect(harness.cancelImport).toHaveBeenCalledTimes(1);

  harness.setSourceMode('folder');
  harness.scheduler.refresh();
  harness.setActive(false);
  harness.scheduler.refresh();
  await harness.fire();
  expect(harness.runImport).not.toHaveBeenCalled();
});
