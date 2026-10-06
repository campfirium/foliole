// @vitest-environment node

import { EventEmitter } from 'node:events';

import { beforeEach, expect, it, vi } from 'vitest';

const workerState = vi.hoisted(() => ({
  releaseTerminate: null as null | (() => void),
  terminateCalled: false
}));

vi.mock('node:worker_threads', () => ({
  Worker: class extends EventEmitter {
    terminate() {
      workerState.terminateCalled = true;
      return new Promise<number>((resolve) => {
        workerState.releaseTerminate = () => resolve(1);
      });
    }
  }
}));
vi.mock('../database/connection.js', () => ({ resolveDatabasePath: () => '/tmp/worker-test.db' }));

import { runPreparedImportInWorkerWithSignal } from './keepImportPreparedImportWorkerClient.js';

beforeEach(() => {
  workerState.releaseTerminate = null;
  workerState.terminateCalled = false;
  vi.useRealTimers();
});

it('does not settle cancellation until the database worker has exited', async () => {
  const controller = new AbortController();
  let settled = false;
  const result = runPreparedImportInWorkerWithSignal({
    prepared: {} as never,
    signal: controller.signal
  }).finally(() => { settled = true; });

  controller.abort();
  await Promise.resolve();
  expect(workerState.terminateCalled).toBe(true);
  expect(settled).toBe(false);

  workerState.releaseTerminate?.();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
});

it('does not report a timeout until the database worker has exited', async () => {
  vi.useFakeTimers();
  let settled = false;
  const result = runPreparedImportInWorkerWithSignal({ prepared: {} as never })
    .finally(() => { settled = true; });

  await vi.advanceTimersByTimeAsync(120_000);
  expect(workerState.terminateCalled).toBe(true);
  expect(settled).toBe(false);

  workerState.releaseTerminate?.();
  await expect(result).rejects.toThrow('Readwise import worker timed out.');
});
