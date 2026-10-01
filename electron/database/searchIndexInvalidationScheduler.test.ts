// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendLog: vi.fn(),
  notify: vi.fn(),
  owner: vi.fn((execute: () => unknown) => Promise.resolve().then(execute)),
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
vi.mock('./connection.js', () => ({ runWithDatabaseConnectionOwner: mocks.owner }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../ipc/searchIndexRebuild.js', () => ({ notifyCurrentSearchIndexStatus: mocks.notify }));

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

it('retries unfinished work after a delay and stops retrying after success', async () => {
  mocks.process.mockResolvedValueOnce({ failed: 1, processed: 0 });
  startSearchIndexInvalidationScheduler();
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.process).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(999);
  expect(mocks.process).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10);
  expect(mocks.process).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.process).toHaveBeenCalledTimes(2);
  expect(mocks.appendLog).toHaveBeenCalledWith('search_index_invalidation_processing_failed', expect.any(Object));
});

it('backs off persistent errors and cancels their retry when stopped', async () => {
  mocks.process.mockRejectedValue(new Error('database busy'));
  startSearchIndexInvalidationScheduler();
  await vi.advanceTimersByTimeAsync(3100);
  expect(mocks.process).toHaveBeenCalledTimes(3);
  stopSearchIndexInvalidationScheduler();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.process).toHaveBeenCalledTimes(3);
});

it('waits for a database owner before reading status after worker completion', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  mocks.owner.mockImplementation(async (execute: () => unknown) => {
    await gate;
    return execute();
  });
  startSearchIndexInvalidationScheduler();
  await vi.runAllTimersAsync();
  expect(mocks.notify).not.toHaveBeenCalled();
  release();
  await vi.waitFor(() => expect(mocks.notify).toHaveBeenCalled());
});
