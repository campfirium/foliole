import { describe, expect, it, vi } from 'vitest';

import { COMPANION_CURRENT_SCHEMA_REPAIRS } from '../../../../../lib/core/database/companionCurrentSchemaRepairs';
import type { NativeCompanionBootstrapState } from '../../../../../lib/platform/nativeCompanionContract';

import { initializeIosCompanionDatabase, type IosCompanionDatabaseManager } from './iosCompanionDatabaseBootstrap';

function createNativeState(): NativeCompanionBootstrapState {
  return {
    booted_at: '2026-07-19T08:00:00Z',
    database_path: null,
    database_ready: false,
    device_id: 'ios-proposed-device',
    device_name: 'iPhone',
    runtime_kind: 'ios-capacitor'
  };
}

function createHarness(args: { missingColumns?: string[]; storedDeviceId?: string } = {}) {
  const missingColumns = new Set(args.missingColumns ?? []);
  const connection = {
    beginTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
    commitTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
    execute: vi.fn(async () => ({ changes: { changes: 0 } })),
    getUrl: vi.fn(async (): Promise<{ url?: string }> => ({
      url: 'file:///Library/CapacitorDatabase/foliole-companionSQLite.db'
    })),
    isDBOpen: vi.fn(async () => ({ result: false })),
    open: vi.fn(async () => undefined),
    query: vi.fn(async (statement: string, values?: unknown[]) => {
      if (statement.includes('pragma_table_info')) {
        const columnName = String(values?.[1] ?? '');
        return { values: missingColumns.has(columnName) ? [] : [{ name: columnName }] };
      }
      return { values: args.storedDeviceId ? [{ value: args.storedDeviceId }] : [] };
    }),
    rollbackTransaction: vi.fn(async () => ({ changes: { changes: 0 } })),
    run: vi.fn(async () => ({ changes: { changes: 1 } }))
  };
  const manager = {
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn(async () => connection)
  } as unknown as IosCompanionDatabaseManager;
  return { connection, manager };
}

describe('iosCompanionDatabaseBootstrap', () => {
  it('creates, opens, and installs the shared schema for a fresh ios database', async () => {
    const { connection, manager } = createHarness();

    await expect(initializeIosCompanionDatabase(createNativeState(), manager)).resolves.toMatchObject({
      database_path: '/Library/CapacitorDatabase/foliole-companionSQLite.db',
      database_ready: true,
      device_id: 'ios-proposed-device'
    });
    expect(manager.createConnection).toHaveBeenCalledWith('foliole-companion', false, 'no-encryption', 19, false);
    expect(connection.open).toHaveBeenCalledTimes(1);
    expect(connection.execute).toHaveBeenNthCalledWith(1, expect.stringContaining('CREATE TABLE IF NOT EXISTS nodes'));
    expect(connection.execute).toHaveBeenNthCalledWith(2, 'PRAGMA user_version = 19', false);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commitTransaction).toHaveBeenCalledTimes(1);
    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO companion_meta'),
      ['device_id', 'ios-proposed-device', '2026-07-19T08:00:00Z']
    );
  });

  it('hydrates the permanent device identity from an existing database', async () => {
    const { connection, manager } = createHarness({ storedDeviceId: 'ios-persisted-device' });
    vi.mocked(manager.isConnection).mockResolvedValue({ result: true });
    connection.isDBOpen.mockResolvedValue({ result: true });

    const result = await initializeIosCompanionDatabase(createNativeState(), manager);

    expect(result.device_id).toBe('ios-persisted-device');
    expect(manager.retrieveConnection).toHaveBeenCalledWith('foliole-companion', false);
    expect(connection.open).not.toHaveBeenCalled();
    expect(connection.run).not.toHaveBeenCalled();
  });

  it('keeps bootstrap failed when the native database has no path', async () => {
    const { connection, manager } = createHarness();
    connection.getUrl.mockResolvedValue({});

    await expect(initializeIosCompanionDatabase(createNativeState(), manager)).rejects.toThrow(/did not return a path/i);
  });

  it('repairs missing companion columns before declaring version 19', async () => {
    const { connection, manager } = createHarness({ missingColumns: ['base_content_hash'] });
    const repair = COMPANION_CURRENT_SCHEMA_REPAIRS.find((entry) => entry.columnName === 'base_content_hash');

    await initializeIosCompanionDatabase(createNativeState(), manager);

    expect(connection.execute).toHaveBeenNthCalledWith(2, repair?.statement, false);
    expect(connection.execute).toHaveBeenNthCalledWith(3, 'PRAGMA user_version = 19', false);
  });

  it('rolls back and does not declare version 19 when repair fails', async () => {
    const { connection, manager } = createHarness({ missingColumns: ['base_content_hash'] });
    connection.execute.mockImplementation(async (statement: string) => {
      if (statement.includes('ADD COLUMN base_content_hash')) throw new Error('repair failed');
      return { changes: { changes: 0 } };
    });

    await expect(initializeIosCompanionDatabase(createNativeState(), manager)).rejects.toThrow('repair failed');

    expect(connection.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commitTransaction).not.toHaveBeenCalled();
    expect(connection.execute).not.toHaveBeenCalledWith('PRAGMA user_version = 19', false);
  });
});
