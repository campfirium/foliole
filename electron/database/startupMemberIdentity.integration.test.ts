import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
let dataRoot = '';
vi.mock('../macosSecurityScopedBookmarksNative.js', () => ({
  loadMacosSecurityScopedBookmarkAdapter: () => ({ status: 'ready', adapter: {
    appGroupContainerPath: () => ({ ok: true, path: path.join(root, 'device-one') })
  } })
}));
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: dataRoot, app_config_dir: path.join(dataRoot, 'config'),
    app_cache_dir: path.join(dataRoot, 'cache'), app_log_dir: path.join(dataRoot, 'logs') })
}));

import { loadDesktopDeviceIdentity } from '../deviceAnchorStore.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { createDesktopSyncGroup, loadDesktopSyncGroup } from './syncGroupStore.js';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-startup-member-'));
  dataRoot = path.join(root, 'original');
  vi.stubEnv('FOLIOLE_ELECTRON_TEST_STATE_ROOT', path.join(root, 'device-one'));
  initializeDatabase(undefined, { verifyMemberIdentity: true });
  const { identity } = await loadDesktopDeviceIdentity({ groupId: 'startup-group',
    libraryPath: openDatabaseConnection().dbPath });
  createDesktopSyncGroup({ device: identity, deviceName: 'Original', platform: process.platform });
  closeDatabaseConnection();
});
afterEach(async () => {
  closeDatabaseConnection();
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

it('reopens the same library on the original device with the same member identity', () => {
  const original = loadDesktopSyncGroup()?.local_device_identity_key;
  closeDatabaseConnection();
  expect(() => initializeDatabase(undefined, { verifyMemberIdentity: true })).not.toThrow();
  expect(loadDesktopSyncGroup()?.local_device_identity_key).toBe(original);
});

it.runIf(process.platform === 'darwin')('reopens the existing member in daily DEV without changing its identity', () => {
  const original = loadDesktopSyncGroup();
  closeDatabaseConnection();
  vi.stubEnv('FOLIOLE_ELECTRON_TEST_STATE_ROOT', path.join(root, 'daily-runtime'));
  vi.stubEnv('FOLIOLE_MACOS_DAILY_DEBUG', '1');
  expect(() => initializeDatabase(undefined, { verifyMemberIdentity: true })).not.toThrow();
  expect(loadDesktopSyncGroup()?.local_device_identity_key).toBe(original?.local_device_identity_key);
  expect(loadDesktopSyncGroup()?.devices).toEqual(original?.devices);
});

it.each(['device anchor', 'library path'])('rejects a changed %s before rewriting membership', async changed => {
  const original = loadDesktopSyncGroup();
  closeDatabaseConnection();
  if (changed === 'device anchor') {
    vi.stubEnv('FOLIOLE_ELECTRON_TEST_STATE_ROOT', path.join(root, 'device-two'));
  } else {
    const copy = path.join(root, 'copy');
    await fs.cp(dataRoot, copy, { recursive: true });
    dataRoot = copy;
  }
  expect(() => initializeDatabase(undefined, { verifyMemberIdentity: true })).toThrow('This library is linked to a different device or location');
  const after = loadDesktopSyncGroup();
  expect(after?.local_device_identity_key).toBe(original?.local_device_identity_key);
  expect(after?.devices).toEqual(original?.devices);
});

it('accepts a symbolic link that resolves to the original library', async () => {
  const original = loadDesktopSyncGroup()?.local_device_identity_key;
  closeDatabaseConnection();
  const alias = path.join(root, 'alias');
  await fs.symlink(dataRoot, alias, 'dir');
  dataRoot = alias;
  expect(() => initializeDatabase(undefined, { verifyMemberIdentity: true })).not.toThrow();
  expect(loadDesktopSyncGroup()?.local_device_identity_key).toBe(original);
});
