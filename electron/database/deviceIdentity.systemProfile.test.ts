import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../sync/companionLanPayloads.js', () => ({ resolveDesktopDeviceName: () => 'Maci' }));
vi.mock('../sync/companionPairingStore.js', () => ({ clearPairedCompanionDevices: vi.fn() }));
vi.mock('../desktopInstallationIdentity.js', () => ({
  loadOrCreateDesktopInstallationIdentity: () => ({ installationId: 'installation-fixture' })
}));
vi.mock('./managedSafetySnapshots.js', () => ({
  createManagedSafetySnapshotForMigration: vi.fn(() => ({
    protection: { release: vi.fn() }, snapshot: {}
  })),
  settleManagedMigrationSnapshot: vi.fn()
}));

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { refreshDesktopDeviceProfile } from './deviceIdentity.js';
import { refreshHostOwnedDeviceProfile } from './deviceProfileMigration.js';

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE sync_group_local_state (
      singleton_id INTEGER PRIMARY KEY, group_id TEXT NOT NULL, local_device_id TEXT NOT NULL,
      member_state TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE sync_group_members (
      group_id TEXT NOT NULL, device_id TEXT NOT NULL, state TEXT NOT NULL,
      device_name TEXT NOT NULL, PRIMARY KEY (group_id, device_id)
    );
    CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT NOT NULL);
    CREATE TABLE review_log (id TEXT PRIMARY KEY, device_id TEXT NOT NULL);
    INSERT INTO settings VALUES ('device_id', '"device-legacy"', '2026-08-01');
    INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'device-legacy', 'active', '2026-08-01');
    INSERT INTO sync_group_members VALUES ('group-1', 'device-legacy', 'active', 'Legacy Device');
    INSERT INTO nodes VALUES ('node-1', 'preserved');
    INSERT INTO review_log VALUES ('review-1', 'device-legacy');
  `);
});

afterEach(() => sqlite.close());

it('refreshes the current profile while preserving content and historical sources', () => {
  const protect = vi.fn();
  const clearCredentials = vi.fn();
  const connection = { driver: createBetterSqlite3Driver(sqlite), sqlite } as never;

  const first = refreshDesktopDeviceProfile({
    clearCredentials, connection, currentDeviceId: 'Maci', now: '2026-08-11',
    previousDeviceId: 'device-legacy', protect
  });
  const second = refreshDesktopDeviceProfile({
    clearCredentials, connection, currentDeviceId: 'Maci', now: '2026-08-12',
    previousDeviceId: 'Maci', protect
  });

  expect(first).toMatchObject({ changed: true, currentDeviceId: 'Maci' });
  expect(second.changed).toBe(false);
  expect(protect).toHaveBeenCalledTimes(1);
  expect(clearCredentials).toHaveBeenCalledTimes(1);
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'device_id'").pluck().get()).toBe('"Maci"');
  expect(sqlite.prepare('SELECT COUNT(*) FROM sync_group_local_state').pluck().get()).toBe(0);
  expect(sqlite.prepare('SELECT device_id, state FROM sync_group_members').get())
    .toEqual({ device_id: 'device-legacy', state: 'active' });
  expect(sqlite.prepare('SELECT content FROM nodes').pluck().get()).toBe('preserved');
  expect(sqlite.prepare('SELECT device_id FROM review_log').pluck().get()).toBe('device-legacy');
});

it('keeps a reset marker until local credentials are actually cleared', () => {
  const connection = { driver: createBetterSqlite3Driver(sqlite), sqlite } as never;
  expect(() => refreshDesktopDeviceProfile({
    clearCredentials: () => { throw new Error('secure storage unavailable'); },
    connection, currentDeviceId: 'Maci', previousDeviceId: 'device-legacy', protect: () => undefined
  })).toThrow('secure storage unavailable');

  const clearCredentials = vi.fn();
  refreshDesktopDeviceProfile({
    clearCredentials, connection, currentDeviceId: 'Maci', previousDeviceId: 'Maci', protect: () => undefined
  });
  expect(clearCredentials).toHaveBeenCalledOnce();
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'device_identity_reset_pending'").get())
    .toBeUndefined();
});

it('keeps an approved active group identity across a same-name host restart', () => {
  sqlite.exec(`
    DELETE FROM sync_group_local_state;
    DELETE FROM sync_group_members;
    UPDATE settings SET value = '"Maci 2"' WHERE key = 'device_id';
    INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'Maci 2', 'active', '2026-08-01');
    INSERT INTO sync_group_members VALUES ('group-1', 'Maci 2', 'active', 'Maci 2');
  `);
  const connection = { driver: createBetterSqlite3Driver(sqlite), sqlite } as never;

  refreshHostOwnedDeviceProfile(connection, 'Maci 2');

  expect(sqlite.prepare('SELECT local_device_id FROM sync_group_local_state').pluck().get()).toBe('Maci 2');
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'device_id'").pluck().get()).toBe('"Maci 2"');
});

it('does not let a copied database overwrite another host public name', () => {
  const connection = { driver: createBetterSqlite3Driver(sqlite), sqlite } as never;

  refreshHostOwnedDeviceProfile(connection, 'device-legacy');

  expect(sqlite.prepare('SELECT COUNT(*) FROM sync_group_local_state').pluck().get()).toBe(0);
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'device_id'").pluck().get()).toBe('"Maci"');
  expect(sqlite.prepare('SELECT device_id, state FROM sync_group_members').get())
    .toEqual({ device_id: 'device-legacy', state: 'active' });
});
