import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
let dataRoot = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: dataRoot, app_config_dir: path.join(dataRoot, 'config'),
    app_cache_dir: path.join(dataRoot, 'cache'), app_log_dir: path.join(dataRoot, 'logs') })
}));

import { loadDatabaseDeviceId } from '../../lib/core/database/syncDeviceIdentity.js';

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadDesktopDeviceId } from './deviceIdentity.js';
import { loadDesktopHostName, migrateDesktopHostProfile } from './hostProfile.js';
import { initializeDatabase } from './migrate.js';
import { resolveExecutableWatchedBinding, upsertChangedWatchedFolderSource } from './watchedFolderBindings.js';

beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-standalone-identity-')); });
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('gives same-name standalone libraries distinct stable UUIDs shared by both readers', () => {
  const ids: string[] = [];
  const names: Array<string | null> = [];
  for (const name of ['one', 'two']) {
    dataRoot = path.join(root, name);
    initializeDatabase();
    const id = loadDesktopDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(loadDatabaseDeviceId(openDatabaseConnection().driver)).toBe(id);
    expect(id).not.toBe(loadDesktopHostName());
    if (id === null) throw new Error('Standalone identity was not initialized.');
    ids.push(id);
    names.push(loadDesktopHostName());
    migrateDesktopHostProfile(openDatabaseConnection(), 'Renamed desktop');
    expect(loadDesktopDeviceId()).toBe(id);
    closeDatabaseConnection();
    initializeDatabase();
    expect(loadDesktopDeviceId()).toBe(id);
    expect(loadDatabaseDeviceId(openDatabaseConnection().driver)).toBe(id);
    closeDatabaseConnection();
  }
  expect(names[0]).toBe(names[1]);
  expect(ids[0]).not.toBe(ids[1]);
});


it('keeps this device UUID and reconnects its restored standalone source', async () => {
  dataRoot = path.join(root, 'restore');
  initializeDatabase();
  const folder = path.join(root, 'watched');
  await fs.mkdir(folder);
  const binding = upsertChangedWatchedFolderSource({ id: 'local-rule', primaryPath: folder,
    actionMode: 'keep', archivePath: '', highlightMode: 'merged', highlightPath: '',
    keepPreview: null, keepState: 'enabled' }, 'before');
  expect(binding).not.toBeNull();
  const backup = await createApplicationDatabaseBackup({ destinationPath: path.join(root, 'saved.db') });
  const currentId = '33333333-3333-4333-8333-333333333333';
  openDatabaseConnection().driver.execute("UPDATE settings SET value = ? WHERE key = 'standalone_device_uuid'",
    [JSON.stringify(currentId)]);
  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });
  expect(loadDesktopDeviceId()).toBe(currentId);
  expect(resolveExecutableWatchedBinding('local-rule', folder).executable).toBe(true);
  closeDatabaseConnection();
  initializeDatabase();
  expect(loadDesktopDeviceId()).toBe(currentId);
  expect(resolveExecutableWatchedBinding('local-rule', folder).executable).toBe(true);
});


it('does not replace an invalid stored UUID with a new or legacy identity', () => {
  dataRoot = path.join(root, 'invalid');
  initializeDatabase();
  const driver = openDatabaseConnection().driver;
  driver.execute("UPDATE settings SET value = ? WHERE key = 'standalone_device_uuid'", ['"not-a-uuid"']);
  expect(() => loadDesktopDeviceId()).toThrow('standalone_device_uuid_invalid');
  expect(() => loadDatabaseDeviceId(driver)).toThrow('standalone_device_uuid_invalid');
  closeDatabaseConnection();
  expect(() => initializeDatabase()).toThrow('standalone_device_uuid_invalid');
  expect(openDatabaseConnection().driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'standalone_device_uuid'")?.value).toBe('"not-a-uuid"');
});
