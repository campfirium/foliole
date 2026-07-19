import { describe, expect, it, vi } from 'vitest';

import type { NativeCompanionBootstrapState } from '../../../lib/platform/nativeCompanionContract';

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

function createHarness(storedDeviceId?: string) {
  const connection = {
    execute: vi.fn(async () => ({ changes: { changes: 0 } })),
    getUrl: vi.fn(async () => ({
      url: 'file:///Library/CapacitorDatabase/foliole-companionSQLite.db'
    })),
    isDBOpen: vi.fn(async () => ({ result: false })),
    open: vi.fn(async () => undefined),
    query: vi.fn(async () => ({ values: storedDeviceId ? [{ value: storedDeviceId }] : [] })),
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
    expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS nodes'));
    expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('PRAGMA user_version = 19'));
    expect(connection.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO companion_meta'),
      ['device_id', 'ios-proposed-device', '2026-07-19T08:00:00Z']
    );
  });

  it('hydrates the permanent device identity from an existing database', async () => {
    const { connection, manager } = createHarness('ios-persisted-device');
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
});
