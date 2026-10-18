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
import { loadCurrentHostDesktopSources, upsertDesktopSource } from './desktopSources.js';
import { initializeDatabase } from './migrate.js';
import { createDesktopSyncGroup, loadDesktopSyncGroup } from './syncGroupStore.js';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-startup-member-'));
  dataRoot = path.join(root, 'original');
  vi.stubEnv('FOLIOLE_ELECTRON_TEST_STATE_ROOT', path.join(root, 'device-one'));
  initializeDatabase(undefined, { rebindMemberIdentity: true });
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
  expect(() => initializeDatabase(undefined, { rebindMemberIdentity: true })).not.toThrow();
  expect(loadDesktopSyncGroup()?.local_device_identity_key).toBe(original);
});

it.runIf(process.platform === 'darwin')('reopens the existing member in daily DEV without changing its identity', () => {
  const original = loadDesktopSyncGroup();
  closeDatabaseConnection();
  vi.stubEnv('FOLIOLE_ELECTRON_TEST_STATE_ROOT', path.join(root, 'daily-runtime'));
  vi.stubEnv('FOLIOLE_MACOS_DAILY_DEBUG', '1');
  expect(() => initializeDatabase(undefined, { rebindMemberIdentity: true })).not.toThrow();
  expect(loadDesktopSyncGroup()?.local_device_identity_key).toBe(original?.local_device_identity_key);
  expect(loadDesktopSyncGroup()?.devices).toEqual(original?.devices);
});

async function reopenChanged(changed: string) {
  closeDatabaseConnection();
  if (changed === 'device anchor') {
    vi.stubEnv('FOLIOLE_ELECTRON_TEST_STATE_ROOT', path.join(root, 'device-two'));
  } else {
    const copy = path.join(root, 'copy');
    await fs.cp(dataRoot, copy, { recursive: true });
    dataRoot = copy;
  }
  expect(() => initializeDatabase(undefined, { rebindMemberIdentity: true })).not.toThrow();
}

function sourceEpoch() {
  return openDatabaseConnection().driver.queryOne<{ source_epoch: string }>(
    'SELECT source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!.source_epoch;
}

it.each(['device anchor', 'library path'])('keeps a library with a changed %s in its group under a new member identity', async changed => {
  const original = loadDesktopSyncGroup()!;
  const originalMember = original.devices[0]!;
  const originalEpoch = sourceEpoch();
  await reopenChanged(changed);
  const after = loadDesktopSyncGroup()!;
  const { identity } = await loadDesktopDeviceIdentity({ groupId: 'startup-group', libraryPath: openDatabaseConnection().dbPath });
  expect(after.group_id).toBe(original.group_id);
  expect(after.local_device_identity_key).toBe(identity.identity_key);
  expect(after.local_device_identity_key).not.toBe(original.local_device_identity_key);
  expect(after.devices.find(device => device.device_identity_key === originalMember.device_identity_key)).toEqual(originalMember);
  expect(after.devices.find(device => device.device_identity_key === identity.identity_key)).toMatchObject({
    device_anchor: identity.device_anchor, canonical_library_path: identity.canonical_library_path, state: 'active'
  });
  expect(sourceEpoch()).not.toBe(originalEpoch);
  closeDatabaseConnection();
  initializeDatabase(undefined, { rebindMemberIdentity: true });
  expect(loadDesktopSyncGroup()).toEqual(after);
});

it('leaves sources of the previous identity for reconnection on the new identity', async () => {
  const previous = loadDesktopSyncGroup()!.local_device_identity_key;
  upsertDesktopSource({ configRef: 'reader', rootPath: path.join(root, 'reader'), sourceType: 'readwise',
    updatedAt: '2026-10-19T00:00:00.000Z' });
  expect(loadCurrentHostDesktopSources('readwise')).toHaveLength(1);
  await reopenChanged('library path');
  expect(loadCurrentHostDesktopSources('readwise')).toEqual([]);
  const stored = openDatabaseConnection().driver.queryOne<{ type_settings_json: string }>(
    "SELECT type_settings_json FROM desktop_sources WHERE source_type = 'readwise'")!;
  expect(JSON.parse(stored.type_settings_json).ownerDeviceIdentityKey).toBe(previous);
});

it('accepts a symbolic link that resolves to the original library', async () => {
  const original = loadDesktopSyncGroup()?.local_device_identity_key;
  closeDatabaseConnection();
  const alias = path.join(root, 'alias');
  await fs.symlink(dataRoot, alias, 'dir');
  dataRoot = alias;
  expect(() => initializeDatabase(undefined, { rebindMemberIdentity: true })).not.toThrow();
  expect(loadDesktopSyncGroup()?.local_device_identity_key).toBe(original);
});
