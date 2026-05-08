import { expect, it, vi } from 'vitest';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';

interface FakeConnection {
  beginTransaction: ReturnType<typeof vi.fn>;
  commitTransaction: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  rollbackTransaction: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

it('maps parameterless DbPort writes to Capacitor execute without implicit transactions', async () => {
  const connection = createFakeConnection();
  const db = createCapacitorSqliteDbPort(connection as never);

  await expect(db.run('INSERT INTO target SELECT * FROM incoming.rows')).resolves.toEqual({
    changes: 7,
    lastInsertRowId: 9
  });

  expect(connection.execute).toHaveBeenCalledWith('INSERT INTO target SELECT * FROM incoming.rows', false);
  expect(connection.run).not.toHaveBeenCalled();
});

it('encodes and decodes blob values at the adapter boundary', async () => {
  const connection = createFakeConnection({ values: [{ id: 'a', body: [1, 2, 3] }] });
  const db = createCapacitorSqliteDbPort(connection as never);

  await db.run('INSERT INTO items (body) VALUES (?)', [new Uint8Array([4, 5, 6])]);
  const rows = await db.query<{ id: string; body: Uint8Array }>('SELECT id, body FROM items');

  expect(connection.run).toHaveBeenCalledWith('INSERT INTO items (body) VALUES (?)', [
    { type: 'Buffer', data: [4, 5, 6] }
  ], false);
  expect(rows[0].body).toBeInstanceOf(Uint8Array);
  expect(Array.from(rows[0].body)).toEqual([1, 2, 3]);
});

it('commits successful transactions and rolls back failed transactions', async () => {
  const connection = createFakeConnection();
  const db = createCapacitorSqliteDbPort(connection as never);

  await db.transaction(async (tx) => {
    await tx.run('INSERT INTO items (id) VALUES (?)', ['a']);
  });
  await expect(db.transaction(async () => {
    throw new Error('fail');
  })).rejects.toThrow('fail');

  expect(connection.beginTransaction).toHaveBeenCalledTimes(2);
  expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
  expect(connection.rollbackTransaction).toHaveBeenCalledTimes(1);
});

it('reuses the active transaction for nested shared-core apply helpers', async () => {
  const connection = createFakeConnection();
  const db = createCapacitorSqliteDbPort(connection as never);

  await db.transaction(async (outer) => {
    await outer.transaction(async (inner) => {
      await inner.run('INSERT INTO items (id) VALUES (?)', ['a']);
    });
  });

  expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
  expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
  expect(connection.rollbackTransaction).not.toHaveBeenCalled();
});

it('keeps the outer transaction rollback boundary when a nested helper fails', async () => {
  const connection = createFakeConnection();
  const db = createCapacitorSqliteDbPort(connection as never);

  await expect(db.transaction(async (outer) => {
    await outer.transaction(async () => {
      throw new Error('nested failure');
    });
  })).rejects.toThrow('nested failure');

  expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
  expect(connection.commitTransaction).not.toHaveBeenCalled();
  expect(connection.rollbackTransaction).toHaveBeenCalledTimes(1);
});

it('normalizes locked database errors for sync retry handling', async () => {
  const connection = createFakeConnection();
  connection.run.mockRejectedValueOnce(new Error('database is locked (code 5 SQLITE_BUSY)'));
  const db = createCapacitorSqliteDbPort(connection as never);

  await expect(db.run('INSERT INTO items (id) VALUES (?)', ['a'])).rejects.toMatchObject({
    code: 'SQLITE_BUSY',
    name: 'DbPortError'
  });
});

function createFakeConnection(queryResult: { values?: unknown[] } = {}): FakeConnection {
  return {
    beginTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
    commitTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
    execute: vi.fn(async () => ({ changes: { changes: 7, lastId: 9 } })),
    query: vi.fn(async () => queryResult),
    rollbackTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
    run: vi.fn(async () => ({ changes: { changes: 1, lastId: 2 } }))
  };
}
