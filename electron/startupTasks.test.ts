// @vitest-environment node
import { expect, it, vi } from 'vitest';

const schedulerMocks = vi.hoisted(() => ({
  submit: vi.fn(() => ({
    cancel: vi.fn(),
    id: 'mirror-startup-backfill-failed',
    promise: Promise.resolve()
  }))
}));

vi.mock('./desktopTaskScheduler.js', () => ({
  desktopTaskScheduler: schedulerMocks
}));

it('submits startup tasks with auditable metadata', async () => {
  const { runStartupTask } = await import('./startupTasks.js');
  const task = vi.fn();

  runStartupTask('[mirror] startup backfill failed', task, {
    cancellable: true,
    cost: 'heavy',
    progress: 'incremental'
  });

  expect(schedulerMocks.submit).toHaveBeenCalledWith(
    expect.objectContaining({
      cancellable: true,
      concurrencyKey: 'mirror-startup-backfill-failed',
      duplicatePolicy: 'coalesce',
      id: 'mirror-startup-backfill-failed',
      metadata: {
        cancellable: true,
        cost: 'heavy',
        progress: 'incremental',
        startupEligibility: 'startup-allowed'
      },
      priority: 'startup',
      run: task,
      runOn: 'main',
      source: 'startup-followup',
      startup: true
    })
  );
});
