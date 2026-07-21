import { expect, it, vi } from 'vitest';

import { createIosCompanionSyncbackStore } from './iosCompanionSyncbackStore';

it('serializes operations and closes each managed connection exactly once', async () => {
  let activeQueries = 0;
  let maxActiveQueries = 0;
  const connection = {
    close: vi.fn(async () => undefined),
    isDBOpen: vi.fn(async () => ({ result: true })),
    query: vi.fn(async () => {
      activeQueries += 1;
      maxActiveQueries = Math.max(maxActiveQueries, activeQueries);
      await Promise.resolve();
      activeQueries -= 1;
      return { values: [] };
    })
  };
  const manager = {
    closeConnection: vi.fn(async () => undefined),
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn(async () => connection)
  };
  const store = createIosCompanionSyncbackStore(manager as never);

  await Promise.all([
    store.loadNodeVersionPushCursor(),
    store.loadReviewLogPushCursor(),
    store.loadStatePushCursor()
  ]);

  expect(maxActiveQueries).toBe(1);
  expect(manager.closeConnection).toHaveBeenCalledTimes(3);
  expect(connection.close).not.toHaveBeenCalled();
});
