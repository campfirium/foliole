import { describe, expect, it, vi } from 'vitest';

import { ANDROID_COMPANION_MIGRATION_PLAN } from '../../../../../lib/core/database/androidCompanionMigrationSchemaStatements';
import {
  COMPANION_DATABASE_VERSION,
  type NativeCompanionBootstrapState
} from '../../../../../lib/platform/nativeCompanionContract';

import { initializeIosCompanionDatabase, type IosCompanionDatabaseManager } from './iosCompanionDatabaseBootstrap';

function nativeState(): NativeCompanionBootstrapState {
  return {
    booted_at: '2026-07-19T08:00:00Z',
    database_path: null,
    database_ready: false,
    device_id: 'ios-device',
    device_name: 'iPhone',
    runtime_kind: 'ios-capacitor'
  };
}

function harness(args: { existed?: boolean; path?: string; storedId?: string; version?: number } = {}) {
  const connection = {
    beginTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
    commitTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
    execute: vi.fn(async () => ({ changes: { changes: 0 } })),
    getUrl: vi.fn(async () => args.path === '' ? {} : ({
      url: args.path ?? 'file:///Library/CapacitorDatabase/foliole-companionSQLite.db'
    })),
    isDBOpen: vi.fn(async () => ({ result: false })),
    open: vi.fn(async () => undefined),
    query: vi.fn(async (sql: string) => queryResult(sql, args)),
    rollbackTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
    run: vi.fn(async () => ({ changes: { changes: 1 } }))
  };
  const manager = {
    closeConnection: vi.fn(async () => undefined),
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    isDatabase: vi.fn(async () => ({ result: args.existed ?? false })),
    retrieveConnection: vi.fn(async () => connection)
  } as unknown as IosCompanionDatabaseManager;
  return { connection, manager };
}

function queryResult(sql: string, args: { existed?: boolean; storedId?: string; version?: number }) {
  if (sql === 'PRAGMA quick_check') return { values: [{ quick_check: 'ok' }] };
  if (sql === 'PRAGMA journal_mode') return { values: [{ journal_mode: 'delete' }] };
  if (sql === 'PRAGMA user_version') return { values: [{ user_version: args.version ?? 0 }] };
  if (sql.includes("name = 'companion_meta'")) return { values: args.existed ? [{ present: 1 }] : [] };
  if (sql.includes("key = 'device_id'")) return { values: args.storedId ? [{ value: args.storedId }] : [] };
  if (sql.includes('pragma_table_info')) return { values: [{ name: 'present' }] };
  return { values: [] };
}

describe('iosCompanionDatabaseBootstrap version contract', () => {
  it('tracks the latest shared companion migration independently of the desktop schema', () => {
    expect(COMPANION_DATABASE_VERSION).toBe(
      Math.max(...ANDROID_COMPANION_MIGRATION_PLAN.map((migration) => migration.beforeVersion))
    );
  });
});

describe('iosCompanionDatabaseBootstrap', () => {
  it('creates a fresh database through the shared lifecycle transaction', async () => {
    const { connection, manager } = harness();
    const result = await initializeIosCompanionDatabase(nativeState(), manager);

    expect(result).toMatchObject({
      database_path: '/Library/CapacitorDatabase/foliole-companionSQLite.db',
      database_ready: true,
      device_id: 'ios-device'
    });
    expect(manager.createConnection).toHaveBeenCalledWith(
      'foliole-companion', false, 'no-encryption', COMPANION_DATABASE_VERSION, false
    );
    expect(connection.query).toHaveBeenCalledWith('PRAGMA busy_timeout = 5000', []);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO companion_meta'),
      ['device_id', 'ios-device', '2026-07-19T08:00:00Z'],
      false
    );
  });

  it('hydrates and validates the permanent identity from an existing database', async () => {
    const { connection, manager } = harness({ existed: true, storedId: 'ios-device', version: 21 });
    const result = await initializeIosCompanionDatabase(nativeState(), manager);

    expect(result.device_id).toBe('ios-device');
    expect(connection.run).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO companion_meta'), expect.anything(), false);
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('blocks an identity mismatch before the migration transaction starts', async () => {
    const { connection, manager } = harness({ existed: true, storedId: 'different-device', version: 21 });

    await expect(initializeIosCompanionDatabase(nativeState(), manager)).rejects.toThrow('identity-mismatch');
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(manager.closeConnection).toHaveBeenCalledTimes(1);
  });

  it('blocks a newer database before any write', async () => {
    const { connection, manager } = harness({
      existed: true, storedId: 'ios-device', version: COMPANION_DATABASE_VERSION + 1
    });

    await expect(initializeIosCompanionDatabase(nativeState(), manager)).rejects.toThrow('newer-version');
    expect(connection.beginTransaction).not.toHaveBeenCalled();
  });

  it('rolls back migration and leaves readiness false when acceptance injection fails', async () => {
    const { connection, manager } = harness({ existed: true, storedId: 'ios-device', version: 18 });

    await expect(initializeIosCompanionDatabase(nativeState(), manager, {
      afterRepair: () => { throw new Error('acceptance upgrade fault'); }
    })).rejects.toThrow('acceptance upgrade fault');
    expect(connection.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commitTransaction).not.toHaveBeenCalled();
  });

  it('closes a failed owner when the plugin returns no database path', async () => {
    const { manager } = harness({ path: '' });
    await expect(initializeIosCompanionDatabase(nativeState(), manager)).rejects.toThrow(/did not return a path/i);
    expect(manager.closeConnection).toHaveBeenCalledTimes(1);
  });
});
