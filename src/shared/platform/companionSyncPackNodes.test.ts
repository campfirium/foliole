import { expect, it, vi } from 'vitest';

import {
  applyCompanionSyncPackNodesWithSharedCore,
  applyCompanionSyncPackPathWithSharedCore
} from './companionSyncPackNodes';

it('attaches a sync pack before applying pack nodes through the shared core', async () => {
  const connection = createFakeConnection();
  const manager = {
    closeConnection: vi.fn(async () => undefined),
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
    applied_blob_count: 0,
    appliedBlobCount: 0,
    applied_object_count: 0,
    appliedPackBlobCount: 0,
    appliedPackObjectCount: 0,
    applied_review_op_ids: [],
    appliedObjectCount: 0,
    appliedReviewOpIds: [],
    fromStateSeq: 0,
    to_state_seq: 4,
    toStateSeq: 4
  });

  expect(connection.open).toHaveBeenCalled();
  expect(connection.execute).toHaveBeenNthCalledWith(
    1,
    "ATTACH DATABASE '/tmp/incoming pack.db' AS inc",
    false
  );
  expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
  expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
  expect(connection.execute).toHaveBeenLastCalledWith('DETACH DATABASE inc', false);
  expect(connection.close).toHaveBeenCalledTimes(1);
  expect(manager.closeConnection).toHaveBeenCalledWith('foliole-companion', false);
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO main.nodes'), false);
});

it('reuses an already open companion database connection', async () => {
  const connection = createFakeConnection();
  connection.isDBOpen.mockResolvedValue({ result: true });
  connection.query.mockResolvedValueOnce({ values: [{ value: JSON.stringify({ from_state_seq: 0, to_state_seq: 1 }) }] });
  const manager = {
    closeConnection: vi.fn(async () => undefined),
    createConnection: vi.fn(),
    isConnection: vi.fn(async () => ({ result: true })),
    retrieveConnection: vi.fn(async () => connection)
  };

  await applyCompanionSyncPackNodesWithSharedCore({
    currentCursor: 0,
    deviceId: 'ios-device',
    packPath: '/tmp/pack.db'
  }, manager as never);

  expect(connection.open).not.toHaveBeenCalled();
});

it('loads and advances the pack cursor around the shared core apply', async () => {
  const connection = createFakeConnection();
  const manager = {
    closeConnection: vi.fn(async () => undefined),
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn()
  };
  const cursorStore = {
    loadCursor: vi.fn(async () => 2),
    saveCursor: vi.fn(async (cursor: number | null) => cursor)
  };

  mockPackApplyQueries(connection, { appliedCount: 2, fromStateSeq: 2, toStateSeq: 5 });

  await expect(applyCompanionSyncPackPathWithSharedCore({
    deviceId: 'android-device',
    packPath: '/tmp/pack.db'
  }, cursorStore, manager as never)).resolves.toMatchObject({
    applied: true,
    to_state_seq: 5
  });

  expect(cursorStore.loadCursor).toHaveBeenCalled();
  expect(cursorStore.saveCursor).toHaveBeenCalledWith(5);
});

it('does not advance the pack cursor when no objects were applied', async () => {
  const connection = createFakeConnection();
  const manager = {
    closeConnection: vi.fn(async () => undefined),
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn()
  };
  const cursorStore = {
    loadCursor: vi.fn(async () => 2),
    saveCursor: vi.fn(async (cursor: number | null) => cursor)
  };

  mockPackApplyQueries(connection, { appliedCount: 0, fromStateSeq: 2, toStateSeq: 5 });

  await expect(applyCompanionSyncPackPathWithSharedCore({
    deviceId: 'android-device',
    packPath: '/tmp/empty-apply-pack.db'
  }, cursorStore, manager as never)).rejects.toThrow('sync_pack_applied_no_objects');

  expect(cursorStore.saveCursor).not.toHaveBeenCalled();
});

it('retrieves an existing Android companion database connection before attaching a sync pack', async () => {
  const connection = createFakeConnection();
  const manager = {
    closeConnection: vi.fn(async () => undefined),
    createConnection: vi.fn(async () => {
      throw new Error('CreateConnection: Connection foliole-companion already exists');
    }),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn(async () => connection)
  };

  connection.query.mockResolvedValueOnce({ values: [{ value: JSON.stringify({ from_state_seq: 0, to_state_seq: 1 }) }] });

  await expect(applyCompanionSyncPackNodesWithSharedCore({
    currentCursor: 0,
    deviceId: 'android-device',
    packPath: '/tmp/downloaded-pack.db'
  }, manager as never)).resolves.toMatchObject({
    applied: true,
    to_state_seq: 1
  });

  expect(manager.retrieveConnection).toHaveBeenCalledWith('foliole-companion', false);
  expect(connection.execute).toHaveBeenNthCalledWith(
    1,
    "ATTACH DATABASE '/tmp/downloaded-pack.db' AS inc",
    false
  );
});

it('detaches the incoming pack when shared core apply fails', async () => {
  const connection = createFakeConnection();
  const manager = {
    closeConnection: vi.fn(async () => undefined),
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn()
  };

  connection.query.mockRejectedValueOnce(new Error('bad pack manifest'));

  await expect(applyCompanionSyncPackNodesWithSharedCore({
    currentCursor: 0,
    deviceId: 'android-device',
    packPath: '/tmp/bad-pack.db'
  }, manager as never)).rejects.toThrow('bad pack manifest');

  expect(connection.execute).toHaveBeenNthCalledWith(
    1,
    "ATTACH DATABASE '/tmp/bad-pack.db' AS inc",
    false
  );
  expect(connection.execute).toHaveBeenLastCalledWith('DETACH DATABASE inc', false);
  expect(connection.close).toHaveBeenCalledTimes(1);
  expect(manager.closeConnection).toHaveBeenCalledWith('foliole-companion', false);
});

function createFakeConnection() {
  return {
    beginTransaction: vi.fn(),
    close: vi.fn(async () => undefined),
    commitTransaction: vi.fn(),
    execute: vi.fn(async () => ({ changes: { changes: 0 } })),
    isDBOpen: vi.fn(async () => ({ result: false })),
    open: vi.fn(async () => undefined),
    query: vi.fn(async (sql: string): Promise<{ values: Array<Record<string, unknown>> }> => {
      void sql;
      return { values: [] };
    }),
    rollbackTransaction: vi.fn(),
    run: vi.fn(async () => ({ changes: { changes: 0 } }))
  };
}

function mockPackApplyQueries(
  connection: ReturnType<typeof createFakeConnection>,
  args: { appliedCount: number; fromStateSeq: number; toStateSeq: number }
) {
  connection.query.mockImplementation(async (sql: string) => {
    if (sql.includes('pack_manifest')) {
      return { values: [{ value: JSON.stringify({ from_state_seq: args.fromStateSeq, to_state_seq: args.toStateSeq }) }] };
    }
    if (sql.includes('COALESCE(MAX(state_seq), 0) + 1 AS next_state_seq')) {
      return { values: [{ next_state_seq: 1 }] };
    }
    if (sql.includes('COUNT(*) AS count')) {
      return { values: [{ count: args.appliedCount }] };
    }
    return { values: [] };
  });
}
