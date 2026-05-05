import { expect, it, vi } from 'vitest';

import { applyCompanionSyncPackNodesWithSharedCore } from './companionSyncPackNodes';

it('attaches a sync pack before applying pack nodes through the shared core', async () => {
  const connection = createFakeConnection();
  const manager = {
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn()
  };

  connection.query.mockResolvedValueOnce({ values: [{ value: JSON.stringify({ from_state_seq: 0, to_state_seq: 4 }) }] });

  await expect(applyCompanionSyncPackNodesWithSharedCore({
    currentCursor: 0,
    deviceId: 'android-device',
    packPath: '/tmp/incoming pack.db'
  }, manager as never)).resolves.toEqual({
    applied: true,
    appliedPackObjectCount: 0,
    appliedObjectCount: 0,
    fromStateSeq: 0,
    toStateSeq: 4
  });

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
