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
vi.mock('../../lib/core/database/searchIndexInvalidations.js', () => ({
  processSearchIndexInvalidations: mocks.process
}));
vi.mock('../diagnostics/mainProcessDiagnostics.js', () => ({
  appendMainProcessDiagnosticLog: mocks.appendLog
}));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => ({ driver: {} })
}));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.process.mockReset();
  mocks.process
    .mockReturnValueOnce({ failed: 0, processed: 500 })
    .mockReturnValueOnce({ failed: 0, processed: 23 });
});

afterEach(async () => {
  const { stopSearchIndexInvalidationScheduler } = await import('./searchIndexInvalidationScheduler.js');
  stopSearchIndexInvalidationScheduler();
  vi.useRealTimers();
});

it('continues draining after a full batch', async () => {
  const { startSearchIndexInvalidationScheduler } = await import('./searchIndexInvalidationScheduler.js');

  startSearchIndexInvalidationScheduler();
  await vi.runAllTimersAsync();

  expect(mocks.process).toHaveBeenCalledTimes(2);
  expect(mocks.process).toHaveBeenNthCalledWith(1, {}, 500);
  expect(mocks.process).toHaveBeenNthCalledWith(2, {}, 500);
});
