import { expect, it, vi } from 'vitest';

import { COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';

import {
  CapacitorCompanionDatabaseOwner,
  type CapacitorCompanionDatabaseManager
} from './capacitorCompanionDatabaseOwner';

function harness(journalMode = 'delete', platform: 'android' | 'ios' = 'ios') {
  const connection = {
    beginTransaction: vi.fn(async () => ({})),
    commitTransaction: vi.fn(async () => ({})),
    execute: vi.fn(async () => ({})),
    getUrl: vi.fn(async () => ({ url: '/isolated/fixture.db' })),
    isDBOpen: vi.fn(async () => ({ result: true })),
    open: vi.fn(async () => undefined),
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql === 'PRAGMA quick_check') return { values: [{ quick_check: 'ok' }] };
      if (sql === 'PRAGMA journal_mode') return { values: [{ journal_mode: journalMode }] };
      if (sql === 'PRAGMA user_version') return { values: [{ user_version: COMPANION_DATABASE_VERSION }] };
      if (sql.includes("name = 'companion_meta'")) return { values: [{ present: 1 }] };
      if (sql.includes('SELECT value FROM companion_meta') && values[0] === 'device_id') {
        return { values: [{ value: 'device' }] };
      }
      if (sql.includes('pragma_table_info')) return { values: [{ name: 'present' }] };
      if (sql === 'PRAGMA wal_checkpoint(FULL)') return { values: [{ busy: 0, log: 1, checkpointed: 1 }] };
      return { values: [] };
    }),
    rollbackTransaction: vi.fn(async () => ({})),
    run: vi.fn(async () => ({ changes: { changes: 1 } }))
  };
  const manager = {
    closeConnection: vi.fn(async () => undefined),
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: true })),
    isDatabase: vi.fn(async () => ({ result: true })),
    retrieveConnection: vi.fn(async () => connection)
  } as unknown as CapacitorCompanionDatabaseManager;
  return { connection, manager, owner: new CapacitorCompanionDatabaseOwner(manager, platform) };
}

it('reuses one connection and serializes every shared writer task', async () => {
  const { connection, manager, owner } = harness();
  await owner.open({ expectedHostName: 'device', now: '2026-08-06T00:00:00Z' });
  const events: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = owner.runWriter(async () => {
    events.push('first-start');
    await gate;
    events.push('first-end');
  });
  const second = owner.runWriter(async () => { events.push('second'); });
  await vi.waitFor(() => expect(events).toEqual(['first-start']));
  release();
  await Promise.all([first, second]);

  expect(events).toEqual(['first-start', 'first-end', 'second']);
  expect(connection.query).toHaveBeenCalledWith('PRAGMA busy_timeout = 5000', []);
  expect(manager.retrieveConnection).toHaveBeenCalledTimes(1);
  expect(manager.createConnection).not.toHaveBeenCalled();
});

it('lets shared reads observe only committed writer state', async () => {
  const { owner } = harness();
  await owner.open({ expectedHostName: 'device', now: '2026-08-06T00:00:00Z' });
  const events: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const write = owner.runWriter(async () => {
    events.push('write-start');
    await gate;
    events.push('write-commit');
  });
  const read = owner.read(async () => { events.push('read'); });

  await vi.waitFor(() => expect(events).toEqual(['write-start']));
  release();
  await Promise.all([write, read]);
  expect(events).toEqual(['write-start', 'write-commit', 'read']);
});

it('waits for writers, checkpoints WAL, and closes the unique owner connection', async () => {
  const { connection, manager, owner } = harness('wal');
  await owner.open({ expectedHostName: 'device', now: '2026-08-06T00:00:00Z' });
  await owner.runWriter(async (db) => db.run("INSERT INTO companion_meta VALUES ('k','v','now')"));
  await owner.close();

  expect(connection.query).toHaveBeenCalledWith('PRAGMA wal_checkpoint(FULL)', []);
  expect(manager.closeConnection).toHaveBeenCalledWith('foliole-companion', false);
  await expect(owner.read(async () => true)).rejects.toThrow('not open');
});


it.each(['android', 'ios'] as const)('%s keeps a multi-query read intact before writing and closing', async (platform) => {
  const { owner, manager } = harness('delete', platform);
  await owner.open({ expectedHostName: 'device', now: '2026-08-06T00:00:00Z' });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const events: string[] = [];
  const read = owner.read(async (db) => {
    await db.query('SELECT 1');
    events.push('read-start');
    await gate;
    await db.query('SELECT 2');
    events.push('read-end');
  });
  await vi.waitFor(() => expect(events).toEqual(['read-start']));
  const write = owner.runWriter(async () => { events.push('write'); });
  const close = owner.close().then(() => { events.push('close'); });
  await Promise.resolve();
  await Promise.resolve();
  const beforeRelease = [...events];
  const closedBeforeRelease = vi.mocked(manager.closeConnection).mock.calls.length;
  release();
  await Promise.all([read, write, close]);
  expect(beforeRelease).toEqual(['read-start']);
  expect(closedBeforeRelease).toBe(0);
  expect(events).toEqual(['read-start', 'read-end', 'write', 'close']);
});

it('rejects work after close and can reopen in the same call order', async () => {
  const { owner, manager } = harness();
  const request = { expectedHostName: 'device', now: '2026-08-06T00:00:00Z' };
  await owner.open(request);
  const close = owner.close();
  const duplicateClose = owner.close();
  const rejectedRead = expect(owner.read(async () => true)).rejects.toThrow('not open');
  const rejectedWrite = expect(owner.runWriter(async () => true)).rejects.toThrow('not open');
  const reopen = owner.open(request);
  const read = owner.read(async (db) => db.query('SELECT 1'));
  await Promise.all([close, duplicateClose, rejectedRead, rejectedWrite, reopen, read]);
  expect(manager.closeConnection).toHaveBeenCalledTimes(1);
  expect(manager.retrieveConnection).toHaveBeenCalledTimes(2);
});

it('does not let a failed read or writer strand subsequent work', async () => {
  const { owner } = harness();
  await owner.open({ expectedHostName: 'device', now: '2026-08-06T00:00:00Z' });
  const readFailure = expect(owner.read(async () => { throw new Error('read failed'); }))
    .rejects.toThrow('read failed');
  const writeFailure = expect(owner.runWriter(async () => { throw new Error('write failed'); }))
    .rejects.toThrow('write failed');
  const recovery = owner.read(async (db) => db.query('SELECT 1'));
  await Promise.all([readFailure, writeFailure, recovery]);
  await owner.close();
});

it('serializes concurrent opening and closing without leaking the connection', async () => {
  const { owner, manager } = harness();
  const request = { expectedHostName: 'device', now: '2026-08-06T00:00:00Z' };
  const open = owner.open(request);
  const duplicateOpen = expect(owner.open(request)).rejects.toThrow('already open');
  const close = owner.close();
  await Promise.all([open, duplicateOpen, close]);
  expect(manager.retrieveConnection).toHaveBeenCalledTimes(1);
  expect(manager.closeConnection).toHaveBeenCalledTimes(1);
  await expect(owner.read(async () => true)).rejects.toThrow('not open');
});


it('preserves a failed close for retry without poisoning subsequent operations', async () => {
  const { owner, manager } = harness('wal');
  await owner.open({ expectedHostName: 'device', now: '2026-08-06T00:00:00Z' });
  vi.mocked(manager.closeConnection).mockRejectedValueOnce(new Error('close failed'));
  await expect(owner.close()).rejects.toThrow('close failed');
  expect(owner.databasePath).toBe('/isolated/fixture.db');
  await owner.close();
  expect(manager.closeConnection).toHaveBeenCalledTimes(2);
  await expect(owner.read(async () => true)).rejects.toThrow('not open');
});
