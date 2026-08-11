import { expect, it, vi } from 'vitest';

import { COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';

import {
  CapacitorCompanionDatabaseOwner,
  type CapacitorCompanionDatabaseManager
} from './capacitorCompanionDatabaseOwner';

function harness(journalMode = 'delete') {
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
  return { connection, manager, owner: new CapacitorCompanionDatabaseOwner(manager, 'ios') };
}

it('reuses one connection and serializes every shared writer task', async () => {
  const { connection, manager, owner } = harness();
  await owner.open({ expectedDeviceId: 'device', now: '2026-08-06T00:00:00Z' });
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
  await owner.open({ expectedDeviceId: 'device', now: '2026-08-06T00:00:00Z' });
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
  await owner.open({ expectedDeviceId: 'device', now: '2026-08-06T00:00:00Z' });
  await owner.runWriter(async (db) => db.run("INSERT INTO companion_meta VALUES ('k','v','now')"));
  await owner.close();

  expect(connection.query).toHaveBeenCalledWith('PRAGMA wal_checkpoint(FULL)', []);
  expect(manager.closeConnection).toHaveBeenCalledWith('foliole-companion', false);
  await expect(owner.read(async () => true)).rejects.toThrow('not open');
});
