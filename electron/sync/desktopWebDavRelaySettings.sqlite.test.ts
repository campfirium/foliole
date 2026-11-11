// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { createDesktopSyncGroup } from '../database/syncGroupStore.js';
import * as credentialStore from '../security/desktopWebDavCredentialStore.js';

import {
  loadDesktopWebDavRelayDirectory, saveDesktopWebDavRelayCredentials, saveDesktopWebDavRelayDirectory
} from './desktopWebDavRelaySettings.js';
import * as probe from './testWebDavRelayConnection.js';
import { withWebDavFixture } from './webDavRelay.testSupport.js';

let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root,
  app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'),
  app_log_dir: path.join(root, 'logs')
}) }));

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

async function createGroup() {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-dav-settings-'));
  initializeDatabase();
  const device = createSyncGroupDeviceIdentity({
    device_anchor: '11111111-1111-4111-8111-111111111111',
    group_id: 'relay-test', library_path: '/test/library', path_flavor: 'posix'
  });
  return createDesktopSyncGroup({
    device, deviceName: 'Test Mac', platform: 'darwin'
  }).group_id;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

it('reopens the verified folder and keeps it when a replacement fails verification', async () => {
  const groupId = await createGroup();
  await withWebDavFixture(false, async url => {
    expect(await loadDesktopWebDavRelayDirectory(groupId)).toEqual({ directory: null, credential_directory: null });
    expect(await saveDesktopWebDavRelayDirectory(groupId, url)).toBe(`${url}/`);
    await expect(saveDesktopWebDavRelayDirectory(groupId, `${url}/missing`)).rejects.toThrow('HTTP 404');
    closeDatabaseConnection();
    expect(await loadDesktopWebDavRelayDirectory(groupId)).toEqual({ directory: `${url}/`, credential_directory: null });
  });
});

// SKIP: macOS credential storage flow | 2026-11-11 | revive: another host supports DAV credentials
it.skipIf(process.platform !== 'darwin')('rejects a credential save that crosses a library epoch change', async () => {
  const groupId = await createGroup();
  const directory = 'https://dav.example.test/relay/';
  const release = deferred<Buffer>();
  const reachedEncryption = deferred<void>();
  vi.spyOn(probe, 'testWebDavRelayConnection').mockResolvedValue(directory);
  vi.spyOn(credentialStore, 'encryptDesktopWebDavCredentialDraft').mockImplementation(() => {
    reachedEncryption.resolve();
    return release.promise;
  });

  const saving = saveDesktopWebDavRelayCredentials(groupId, directory, { username: 'fixture', password: 'fixture' });
  const outcome = expect(saving).rejects.toThrow('webdav_relay_settings_changed');
  await reachedEncryption.promise;
  try {
    await runWithDatabaseConnectionOwner(() => openDatabaseConnection().driver.execute(
      "UPDATE node_version_local_proof_state SET library_epoch = 'replacement-epoch' WHERE singleton_id = 1"
    ));
  } finally {
    release.resolve(Buffer.from('ciphertext fixture'));
  }
  await outcome;
  expect(await loadDesktopWebDavRelayDirectory(groupId)).toEqual({ directory: null, credential_directory: null });
  await expect(fs.readdir(path.join(root, 'config', 'webdav-credentials'))).rejects.toMatchObject({ code: 'ENOENT' });
});
