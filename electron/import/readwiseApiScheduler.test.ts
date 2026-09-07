import { beforeEach, expect, it, vi } from 'vitest';

import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';

import { createReadwiseApiScheduler } from './readwiseApiScheduler.js';

const NOW = Date.parse('2026-09-08T12:00:00.000Z');

function createHarness() {
  let callback: (() => void) | null = null;
  let connectionRef = 'connection-one';
  let completedThrough: string | null = '2026-09-08T11:30:00.000Z';
  let sourceMode: 'api' | 'folder' = 'api';
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
    loadHostAssignment: vi.fn(() => ({
      active_host_name: 'Mac', current_host_name: 'Mac', hosts: [], is_active: active, legacy_unassigned: false
    })),
    loadScheduleState: vi.fn(() => ({
      connectionRef, lastResult: null, nextRunAt: null, version: 1 as const
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
    setSourceMode: (value: 'api' | 'folder') => { sourceMode = value; }
  };
}

beforeEach(() => vi.clearAllMocks());

it('does not schedule API intake before the first import completes', () => {
  const harness = createHarness();
  harness.setCompletedThrough(null);
  harness.scheduler.refresh();

  expect(harness.dependencies.setTimeout).not.toHaveBeenCalled();
  expect(harness.scheduler.loadStatus().eligibility).toBe('first_import_required');
});

it('schedules one incremental run from the completed watermark', async () => {
  const harness = createHarness();
  harness.scheduler.refresh();

  expect(harness.dependencies.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1_800_000);
  expect(harness.saveNextRun).toHaveBeenCalledWith('connection-one', '2026-09-08T12:30:00.000Z');
  await harness.fire();
  expect(harness.runImport).toHaveBeenCalledWith({ trigger: 'scheduled' });
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
