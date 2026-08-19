import { expect, it, vi } from 'vitest';

import { COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';

import {
  CapacitorCompanionDatabaseOwner,
  type CapacitorCompanionDatabaseManager
} from './capacitorCompanionDatabaseOwner';

type Platform = 'android' | 'ios';

it.each<Platform>(['android', 'ios'])('rolls back the %s owner before version commit', async (platform) => {
  const { connection, manager } = harness(COMPANION_DATABASE_VERSION);
  const owner = new CapacitorCompanionDatabaseOwner(manager, platform);

  await expect(owner.open({
    beforeVersionCommit: () => { throw new Error('injected cutover failure'); },
    expectedDeviceId: 'device',
    now: '2026-08-19T00:00:00Z'
  })).rejects.toThrow('injected cutover failure');

  expect(connection.beginTransaction).toHaveBeenCalledOnce();
  expect(connection.rollbackTransaction).toHaveBeenCalledOnce();
  expect(connection.commitTransaction).not.toHaveBeenCalled();
  expect(versionWrites(connection.run.mock.calls)).toEqual([]);
  expect(manager.closeConnection).toHaveBeenCalledWith('foliole-companion', false);
});

it.each<Platform>(['android', 'ios'])('blocks a newer %s database before writes', async (platform) => {
  const { connection, manager } = harness(COMPANION_DATABASE_VERSION + 1);
  const owner = new CapacitorCompanionDatabaseOwner(manager, platform);

  await expect(owner.open({ expectedDeviceId: 'device', now: '2026-08-19T00:00:00Z' }))
    .rejects.toThrow('newer-version');

  expect(connection.beginTransaction).not.toHaveBeenCalled();
  expect(connection.run).not.toHaveBeenCalled();
  expect(manager.closeConnection).toHaveBeenCalledWith('foliole-companion', false);
});

function harness(version: number) {
  const connection = {
    beginTransaction: vi.fn(async () => ({})),
    commitTransaction: vi.fn(async () => ({})),
    getUrl: vi.fn(async () => ({ url: '/isolated/fixture.db' })),
    isDBOpen: vi.fn(async () => ({ result: true })),
    open: vi.fn(async () => undefined),
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql === 'PRAGMA quick_check') return { values: [{ quick_check: 'ok' }] };
      if (sql === 'PRAGMA journal_mode') return { values: [{ journal_mode: 'delete' }] };
      if (sql === 'PRAGMA user_version') return { values: [{ user_version: version }] };
      if (sql.includes("name = 'companion_meta'")) return { values: [{ present: 1 }] };
      if (sql.includes('FROM companion_meta WHERE key = ?') && values[0] === 'device_id') {
        return { values: [{ value: 'device' }] };
      }
      if (sql.includes('pragma_table_info')) return { values: [{ name: 'present' }] };
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
  return { connection, manager };
}

function versionWrites(calls: unknown[][]) {
  return calls.filter(([sql]) => typeof sql === 'string' && sql.startsWith('PRAGMA user_version ='));
}
