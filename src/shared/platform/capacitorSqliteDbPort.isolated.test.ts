import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  closeConnection: vi.fn(async () => undefined),
  createConnection: vi.fn(),
  delete: vi.fn(async () => undefined),
  getUrl: vi.fn(async () => ({ url: 'file:///private/tmp/isolated%20pack.db' })),
  open: vi.fn(async () => undefined)
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android' },
  registerPlugin: () => ({})
}));
vi.mock('@capacitor-community/sqlite', () => ({
  SQLiteConnection: class {
    createConnection = native.createConnection;
    closeConnection = native.closeConnection;
  }
}));

import { createIsolatedCapacitorDatabaseManager } from './capacitorSqliteDbPort';

beforeEach(() => {
  vi.clearAllMocks();
  native.createConnection.mockResolvedValue({
    close: native.close, delete: native.delete, getUrl: native.getUrl, open: native.open
  });
});

it('closes an isolated pack before exposing its decoded path for attachment', async () => {
  const database = await createIsolatedCapacitorDatabaseManager().create('isolated-pack');
  await database.open();
  expect(native.createConnection).toHaveBeenCalledWith('isolated-pack', false, 'no-encryption', 1, false);
  await expect(database.prepareAttachedRead()).resolves.toBe('/private/tmp/isolated pack.db');
  expect(native.open).toHaveBeenCalledOnce();
  expect(native.close).toHaveBeenCalledOnce();
  expect(native.closeConnection).not.toHaveBeenCalled();
  await database.dispose();
  expect(native.delete).toHaveBeenCalledOnce();
  expect(native.closeConnection).toHaveBeenCalledWith('isolated-pack', false);
});

it('releases the isolated connection even when deleting its database fails', async () => {
  const database = await createIsolatedCapacitorDatabaseManager().create('isolated-receiver');
  native.delete.mockRejectedValueOnce(new Error('delete failed'));
  await expect(database.dispose()).rejects.toThrow('delete failed');
  expect(native.closeConnection).toHaveBeenCalledWith('isolated-receiver', false);
});

it('rejects a missing pack path without closing a still usable connection', async () => {
  const database = await createIsolatedCapacitorDatabaseManager().create('isolated-pack');
  native.getUrl.mockResolvedValueOnce({ url: '' });
  await expect(database.prepareAttachedRead()).rejects.toThrow('path is missing');
  expect(native.close).not.toHaveBeenCalled();
});
