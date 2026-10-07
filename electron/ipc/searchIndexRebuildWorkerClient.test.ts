import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claim: vi.fn(), complete: vi.fn(), fail: vi.fn(), prepare: vi.fn(), retire: vi.fn(), worker: vi.fn(),
  driver: {}, source: { identity: 'library', queuedRevision: 1, revision: 1 }
}));
vi.mock('../database/connection.js', () => ({ openDatabaseConnection: () => ({ driver: mocks.driver }) }));
vi.mock('../database/desktopDatabaseWriteQueue.js', () => ({
  runDesktopDatabaseWrite: (_priority: string, task: () => unknown) => task()
}));
vi.mock('../../lib/core/database/searchIndexInvalidations.js', () => ({
  claimSearchIndexInvalidations: mocks.claim, completeInvalidations: mocks.complete, failInvalidations: mocks.fail
}));
vi.mock('../../lib/core/database/searchPendingState.js', () => ({ retireSearchPendingThrough: mocks.retire }));
vi.mock('../../lib/core/database/workspaceSearchSidecar.js', () => ({ prepareWorkspaceSearchSidecar: mocks.prepare }));
vi.mock('../../lib/core/database/workspaceSearchSourceState.js', () => ({
  markWorkspaceSearchSourceRevisionQueued: () => mocks.source
}));
vi.mock('./searchIndexWorkerTransport.js', () => ({ runSearchWorker: mocks.worker }));

import { runWorkspaceSearchMaintenanceInWorker, runWorkspaceSearchRebuildInWorker } from './searchIndexRebuildWorkerClient.js';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prepare.mockReturnValue(null);
  mocks.claim.mockReturnValue([{ id: 7, invalidation_type: 'node_workspace', target_id: 'node' }]);
  mocks.worker.mockResolvedValue({ ok: true, status: { status: 'ready' }, coveredId: 5 });
});

it.each(['continuous', 'chunked'] as const)('carries %s through required rebuild and incremental work', async (bodyStorage) => {
  mocks.prepare.mockReturnValue('word-based');
  const signal = new AbortController().signal;
  expect(await runWorkspaceSearchMaintenanceInWorker(20, signal, bodyStorage)).toEqual({ failed: 0, processed: 1 });
  expect(mocks.worker).toHaveBeenNthCalledWith(1, { strategy: 'word-based', source: mocks.source, bodyStorage }, signal);
  expect(mocks.worker).toHaveBeenNthCalledWith(2, { rows: mocks.claim.mock.results[0]!.value, bodyStorage }, signal);
  expect(mocks.retire).toHaveBeenCalledWith(mocks.driver, 5);
  expect(mocks.complete).toHaveBeenCalledWith(mocks.driver, [7]);
});

it('keeps unspecified storage continuous for both public entry points', async () => {
  await runWorkspaceSearchRebuildInWorker('word-based');
  await runWorkspaceSearchMaintenanceInWorker(20);
  expect(mocks.worker.mock.calls.map(([input]) => input.bodyStorage)).toEqual(['continuous', 'continuous']);
});

it('retains failure bookkeeping when explicitly chunked worker processing fails', async () => {
  const failure = new Error('body unavailable');
  mocks.worker.mockRejectedValue(failure);
  expect(await runWorkspaceSearchMaintenanceInWorker(20, undefined, 'chunked')).toEqual({ failed: 1, processed: 0 });
  expect(mocks.fail).toHaveBeenCalledWith(mocks.driver, [7], failure);
  expect(mocks.complete).not.toHaveBeenCalled();
});
