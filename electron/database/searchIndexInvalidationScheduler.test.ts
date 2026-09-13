// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendLog: vi.fn(),
  process: vi.fn(),
  setScheduler: vi.fn()
}));
vi.mock('../../lib/core/database/searchIndexInvalidationRuntime.js', () => ({
  setSearchIndexInvalidationScheduler: mocks.setScheduler
}));
vi.mock('../ipc/searchIndexRebuildWorkerClient.js', () => ({
  runWorkspaceSearchMaintenanceInWorker: mocks.process
}));
vi.mock('../diagnostics/mainProcessDiagnostics.js', () => ({
  appendMainProcessDiagnosticLog: mocks.appendLog
}));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../ipc/searchIndexRebuild.js', () => ({ notifyCurrentSearchIndexStatus: vi.fn() }));

import { desktopTaskScheduler } from '../desktopTaskScheduler.js';

import { startSearchIndexInvalidationScheduler, stopSearchIndexInvalidationScheduler } from './searchIndexInvalidationScheduler.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.process.mockReset().mockResolvedValue({ failed: 0, processed: 0 });
});
afterEach(async () => {
  stopSearchIndexInvalidationScheduler();
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});

it('runs full batches in a worker and yields the scheduler to foreground work between batches', async () => {
  const order: string[] = [];
  mocks.process.mockImplementationOnce(async () => {
    order.push('index');
    desktopTaskScheduler.submit({
      concurrencyKey: 'foreground-test', id: 'foreground-test', label: 'Foreground',
      priority: 'foreground', source: 'test', run: () => { order.push('foreground'); }
    });
    return { failed: 0, processed: 500 };
  }).mockImplementationOnce(async () => {
    order.push('index');
    return { failed: 0, processed: 23 };
  });
  startSearchIndexInvalidationScheduler();
  expect(mocks.process).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(order).toEqual(['index', 'foreground', 'index']);
  expect(mocks.process).toHaveBeenCalledWith(500, expect.any(AbortSignal));
});

it('cancels pending maintenance before starting a worker on shutdown', async () => {
  startSearchIndexInvalidationScheduler();
  stopSearchIndexInvalidationScheduler();
  await vi.runAllTimersAsync();
  // The worker client receives cancellation even if the task was still pending.
  expect(mocks.process.mock.calls.every(([, signal]) => signal.aborted)).toBe(true);
});

it('reports failures without repeatedly retrying the same failing backlog', async () => {
  mocks.process.mockResolvedValue({ failed: 1, processed: 0 });
  startSearchIndexInvalidationScheduler();
  await vi.runAllTimersAsync();
  expect(mocks.process).toHaveBeenCalledOnce();
  expect(mocks.appendLog).toHaveBeenCalledWith('search_index_invalidation_processing_failed', expect.any(Object));
});
