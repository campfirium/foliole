// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { createDesktopSyncGroup } from '../database/syncGroupStore.js';

import { loadDesktopWebDavRelayDirectory, saveDesktopWebDavRelayDirectory } from './desktopWebDavRelaySettings.js';
import { withWebDavFixture } from './webDavRelay.testSupport.js';

let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root,
  app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'),
  app_log_dir: path.join(root, 'logs')
}) }));

afterEach(async () => {
  closeDatabaseConnection();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

it('reopens the verified folder and keeps it when a replacement fails verification', async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-dav-settings-'));
  initializeDatabase();
  const device = createSyncGroupDeviceIdentity({
    device_anchor: '11111111-1111-4111-8111-111111111111',
    group_id: 'relay-test', library_path: '/test/library', path_flavor: 'posix'
  });
  const { group_id: groupId } = createDesktopSyncGroup({
    device, deviceName: 'Test Mac', platform: 'darwin'
  });

  await withWebDavFixture(false, async url => {
    expect(await loadDesktopWebDavRelayDirectory(groupId)).toBeNull();
    expect(await saveDesktopWebDavRelayDirectory(groupId, url)).toBe(`${url}/`);
    await expect(saveDesktopWebDavRelayDirectory(groupId, `${url}/missing`)).rejects.toThrow('HTTP 404');
    closeDatabaseConnection();
    expect(await loadDesktopWebDavRelayDirectory(groupId)).toBe(`${url}/`);
  });
});
