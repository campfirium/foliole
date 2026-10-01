// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ path: 'first', completed: false, cleanup: null as (() => void) | null,
  runs: [] as Array<{ run: (context: { signal: AbortSignal }) => Promise<unknown>; cancel: ReturnType<typeof vi.fn>; resolve: (value: unknown) => void }> }));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => ({ dbPath: state.path, sqlite: {} }),
  runWithDatabaseConnectionOwner: (run: () => unknown) => Promise.resolve(run()),
  registerDatabaseConnectionCleanup: (run: () => void) => { state.cleanup = run; }
}));
vi.mock('../../lib/core/database/dataMigrationState.js', () => ({ readDataMigrationState: () => ({ status: state.completed ? 'completed' : 'running' }) }));
vi.mock('./legacyBodyCollectionWorkerClient.js', () => ({ runLegacyBodyCollectionWorker: vi.fn(async () => ({ completed: true })) }));
vi.mock('../desktopOperations.js', () => ({ submitDesktopOperation: (_name: string, args: { run: (context: { signal: AbortSignal }) => Promise<unknown> }) => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((finish) => { resolve = finish; });
  const cancel = vi.fn(() => resolve(undefined));
  state.runs.push({ ...args, cancel, resolve });
  return { id: 'batch', promise, cancel };
} }));
import { startLegacyBodyCollectionTask } from './legacyBodyCollectionTask.js';
import { runLegacyBodyCollectionWorker } from './legacyBodyCollectionWorkerClient.js';

afterEach(() => { state.cleanup?.(); state.runs = []; state.path = 'first'; state.completed = false; vi.clearAllMocks(); });

it('cancels the old library and rejects its queued work after switching, then binds the new task', async () => {
  await startLegacyBodyCollectionTask();
  const first = state.runs[0]!;
  state.cleanup?.();
  state.path = 'second';
  expect(first.cancel).toHaveBeenCalledOnce();
  await expect(first.run({ signal: new AbortController().signal })).rejects.toThrow('body_collection_library_changed');
  expect(runLegacyBodyCollectionWorker).not.toHaveBeenCalled();
  await startLegacyBodyCollectionTask();
  await state.runs[1]!.run({ signal: new AbortController().signal });
  expect(runLegacyBodyCollectionWorker).toHaveBeenCalledWith('second', 32, expect.any(AbortSignal));
});

it('does not submit completed libraries and submits separate batches only after committed results', async () => {
  state.completed = true;
  await startLegacyBodyCollectionTask();
  expect(state.runs).toEqual([]);
  state.completed = false;
  await startLegacyBodyCollectionTask();
  await startLegacyBodyCollectionTask();
  expect(state.runs).toHaveLength(1);
  state.runs[0]!.resolve({ completed: false });
  await Promise.resolve();
  expect(state.runs).toHaveLength(2);
});

it('leaves temporary protections for the next library open instead of resubmitting a scan', async () => {
  await startLegacyBodyCollectionTask();
  state.runs[0]!.resolve({ completed: false, paused: true });
  await Promise.resolve();
  expect(state.runs).toHaveLength(1);
  await startLegacyBodyCollectionTask();
  expect(state.runs).toHaveLength(2);
});
