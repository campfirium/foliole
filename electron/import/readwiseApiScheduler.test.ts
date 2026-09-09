import { beforeEach, expect, it, vi } from 'vitest';

import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import type { NativeReadwiseApiScheduleResult } from '../../lib/platform/nativeReadwiseApiImportContract.js';

import { createReadwiseApiScheduler } from './readwiseApiScheduler.js';

const NOW = Date.parse('2026-09-08T12:00:00.000Z');

function updateMigrationProgress(progress: { completedCount: number; totalCount: number }, completed: number, total: number) {
  progress.completedCount = completed;
  progress.totalCount = total;
}

function createHarness() {
  let callback: (() => void) | null = null;
  let connectionRef = 'connection-one';
  let completedThrough: string | null = '2026-09-08T11:30:00.000Z';
  let sourceMode: 'api' | 'folder' = 'api';
  const migrationProgress = { completedCount: 31, totalCount: 31 };
  let lastResult: NativeReadwiseApiScheduleResult | null = null;
  let active = true;
  const cancelImport = vi.fn(() => ({ status: 'cancelled' as const }));
  const runImport = vi.fn().mockResolvedValue({
    completed_at: '2026-09-08T12:30:00.000Z', failed_count: 0,
    imported_count: 1, source_count: 1, status: 'completed'
  });
  const saveNextRun = vi.fn();
  const dependencies = {
    cancelImport,
    clearTimeout: vi.fn(),
    loadConnectionReady: vi.fn(() => true),
    loadCompletedThrough: vi.fn(() => completedThrough),
    loadInitialProgress: vi.fn(() => migrationProgress),
    loadHostAssignment: vi.fn(() => ({
      active_host_name: 'Mac', current_host_name: 'Mac', hosts: [], is_active: active, legacy_unassigned: false
    })),
    loadScheduleState: vi.fn(() => ({
      connectionRef, lastResult, nextRunAt: null, version: 1 as const
    })),
    loadSettings: vi.fn(() => ({
      ...createDefaultImportManagerSettings(), readwiseSourceMode: sourceMode
    })),
    loadSource: vi.fn(() => ({
      connectionRef, createdAt: '2026-09-08T00:00:00.000Z',
      updatedAt: '2026-09-08T00:00:00.000Z', version: 1 as const
    })),
    now: () => NOW,
    notifyChanged: vi.fn(),
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
    setMigrationProgress: (completed: number, total: number) =>
      updateMigrationProgress(migrationProgress, completed, total),
    setSourceMode: (value: 'api' | 'folder') => { sourceMode = value; }
  };
}

beforeEach(() => vi.clearAllMocks());

it('starts the first API import immediately after the mode and connection are ready', async () => {
  const harness = createHarness();
  harness.setCompletedThrough(null);
  harness.setMigrationProgress(29, 31);
  harness.scheduler.refresh();

  expect(harness.dependencies.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
  expect(harness.scheduler.loadStatus().eligibility).toBe('ready');
  expect(harness.scheduler.loadStatus().initial_import).toEqual({
    completed_count: 29, status: 'pending', total_count: 31
  });
  await harness.fire();
  expect(harness.runImport).toHaveBeenCalledWith({ trigger: 'scheduled' });
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
  expect(harness.scheduler.loadStatus().initial_import.status).toBe('completed');
  await harness.fire();
  expect(harness.runImport).toHaveBeenCalledWith({ trigger: 'scheduled' });
});

it('does not mark source migration complete from an ordinary API watermark', () => {
  const harness = createHarness();
  harness.setMigrationProgress(30, 169);

  expect(harness.scheduler.loadStatus().initial_import).toEqual({
    completed_count: 30, status: 'pending', total_count: 169
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
