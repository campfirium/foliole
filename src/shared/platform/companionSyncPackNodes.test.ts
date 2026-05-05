import { expect, it, vi } from 'vitest';

import { applyCompanionSyncPackNodesWithSharedCore } from './companionSyncPackNodes';

it('attaches a sync pack before applying pack nodes through the shared core', async () => {
  const connection = createFakeConnection();
  const manager = {
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn()
  };

  await applyCompanionSyncPackNodesWithSharedCore('/tmp/incoming pack.db', manager as never);

  expect(connection.open).toHaveBeenCalled();
  expect(connection.execute).toHaveBeenNthCalledWith(
    1,
    "ATTACH DATABASE '/tmp/incoming pack.db' AS inc",
    false
  );
  expect(connection.execute).toHaveBeenLastCalledWith('DETACH DATABASE inc', false);
  expect(connection.run).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO main.nodes'), [], false);
});

function createFakeConnection() {
  return {
    beginTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    execute: vi.fn(async () => ({ changes: { changes: 0 } })),
    open: vi.fn(async () => undefined),
    query: vi.fn(async () => ({ values: [] })),
    rollbackTransaction: vi.fn(),
    run: vi.fn(async () => ({ changes: { changes: 0 } }))
  };
}
