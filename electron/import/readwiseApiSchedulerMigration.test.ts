import { expect, it, vi } from 'vitest';

import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';

import { createReadwiseApiScheduler } from './readwiseApiScheduler.js';

it('runs a reopened one-time migration at startup while the durable mode remains relay', async () => {
  const runImport = vi.fn().mockResolvedValue({ imported_count: 1, status: 'completed' });
  const dependencies = {
    cancelImport: vi.fn(() => ({ status: 'idle' as const })),
    clearTimeout: vi.fn(),
    loadCandidateProgress: vi.fn(() => ({
      completedCount: 0, failedCount: 0, pendingCount: 0, totalCount: 0, unexplainedFailureCount: 0
    })),
    loadCompletedThrough: vi.fn(() => 'completed'),
    loadConnectionReady: vi.fn(() => true),
    loadCutover: vi.fn(() => ({
      annotations: [], cohortDocumentIds: [], completedAt: 'repair', documents: [],
      phase: 'indexing' as const, retiredNodeIds: [], sourceHost: 'Mac', startedAt: 'repair',
      status: 'migration-in-progress' as const, version: 2 as const
    })),
    loadHostAssignment: vi.fn(() => ({
      active_host_name: 'Mac', active_device_identity_key: 'mac-device',
      active_owner_epoch: 1,
      current_host_name: 'Mac', current_device_identity_key: 'mac-device',
      hosts: [], is_active: true, legacy_unassigned: false, handoff_pending: false,
      activation_blocked_reason: null
    })),
    loadMigrationPending: vi.fn(() => false),
    loadScheduleState: vi.fn(() => ({
      connectionRef: 'connection', initialProgress: null, lastResult: null, lifecycle: null,
      nextRunAt: null, version: 2 as const
    })),
    loadSettings: vi.fn(() => ({
      ...createDefaultImportManagerSettings(), readwiseSourceMode: 'relay' as const
    })),
    loadSource: vi.fn(() => ({
      connectionRef: 'connection', createdAt: 'created', updatedAt: 'updated', version: 1 as const
    })),
    loadSourceMode: vi.fn(() => ({ completion: null, conflictReasons: [], mode: 'relay' as const })),
    now: () => 0,
    notifyChanged: vi.fn(),
    queueRun: vi.fn(),
    recoverRun: vi.fn(),
    runImport,
    saveNextRun: vi.fn(),
    setTimeout: vi.fn((next: () => void) => {
      void next;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }),
    trackedRunActive: vi.fn(() => false)
  };
  const scheduler = createReadwiseApiScheduler(dependencies);

  scheduler.refresh(true);
  expect(dependencies.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
  expect(dependencies.queueRun).not.toHaveBeenCalled();
  const scheduled = dependencies.setTimeout.mock.calls[0]?.[0] as (() => void) | undefined;
  scheduled?.();
  await Promise.resolve();
  await Promise.resolve();
  expect(runImport).toHaveBeenCalledWith({ trigger: 'startup' });
});

it('keeps cutover and initial candidate progress independent', () => {
  const dependencies = {
    cancelImport: vi.fn(() => ({ status: 'idle' as const })), clearTimeout: vi.fn(),
    loadCandidateProgress: vi.fn(() => ({
      completedCount: 29, failedCount: 2, pendingCount: 0, totalCount: 31,
      unexplainedFailureCount: 2
    })),
    loadCompletedThrough: vi.fn(() => null), loadConnectionReady: vi.fn(() => true),
    loadCutover: vi.fn(() => ({
      completedAt: 'done', completedCandidateCount: 31, migratedCount: 30,
      sourceHost: 'Mac', startedAt: 'start', status: 'api' as const,
      totalCandidateCount: 31, unmatchedCount: 1, version: 1 as const
    })),
    loadHostAssignment: vi.fn(() => ({
      active_host_name: 'Mac', active_device_identity_key: 'mac-device',
      active_owner_epoch: 1,
      current_host_name: 'Mac', current_device_identity_key: 'mac-device',
      hosts: [], is_active: true, legacy_unassigned: false, handoff_pending: false,
      activation_blocked_reason: null
    })),
    loadMigrationPending: vi.fn(() => false),
    loadScheduleState: vi.fn(() => ({
      connectionRef: 'connection', initialProgress: null, lastResult: null, lifecycle: null,
      nextRunAt: null, version: 2 as const
    })),
    loadSettings: vi.fn(() => createDefaultImportManagerSettings()),
    loadSource: vi.fn(() => ({
      connectionRef: 'connection', createdAt: 'created', updatedAt: 'updated', version: 1 as const
    })),
    loadSourceMode: vi.fn(() => ({ completion: null, conflictReasons: [], mode: 'api' as const })),
    now: () => 0, notifyChanged: vi.fn(), queueRun: vi.fn(), recoverRun: vi.fn(),
    runImport: vi.fn(), saveNextRun: vi.fn(), setTimeout: vi.fn(), trackedRunActive: vi.fn(() => false)
  };
  const status = createReadwiseApiScheduler(dependencies).loadStatus();

  expect(status.cutover).toMatchObject({ completed_count: 31, status: 'completed', total_count: 31 });
  expect(status.initial_sync).toMatchObject({
    completed_count: 29, failed_count: 2, status: 'failed', total_count: 31
  });
});
