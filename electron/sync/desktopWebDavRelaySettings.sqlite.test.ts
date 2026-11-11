// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';

import { afterEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { createDesktopSyncGroup } from '../database/syncGroupStore.js';
import { handleWebDavSyncCommand } from '../ipc/webDavSyncCommands.js';
import * as credentialStore from '../security/desktopWebDavCredentialStore.js';

import {
  loadDesktopWebDavRelayDirectory, saveDesktopWebDavRelayCredentials, saveDesktopWebDavRelayDirectory
} from './desktopWebDavRelaySettings.js';
import * as probe from './testWebDavRelayConnection.js';
import { withWebDavFixture } from './webDavRelay.testSupport.js';
import { fixtureCredentials, startWebDavSetupFixture } from './webDavSetupTls.testSupport.js';

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

function mockFixtureEncryption() {
  vi.spyOn(credentialStore, 'encryptDesktopWebDavCredentialDraft').mockImplementation(async draft =>
    Buffer.from(JSON.stringify(draft)));
  vi.spyOn(credentialStore, 'decryptDesktopWebDavCredentialDraft').mockImplementation(async (_, ciphertext) =>
    JSON.parse(ciphertext.toString()) as credentialStore.DesktopWebDavCredentialDraft);
}

async function withSetupFixture(run: (fixture: Awaited<ReturnType<typeof startWebDavSetupFixture>>) => Promise<void>) {
  const fixture = await startWebDavSetupFixture(root);
  const trust = getCACertificates('default');
  setDefaultCACertificates([fixture.cert, ...trust]);
  try {
    await run(fixture);
  } finally {
    setDefaultCACertificates(trust);
    await fixture.close();
  }
}

// SKIP: macOS WebDAV credential flow | 2026-11-11 | revive: another host supports DAV credentials
it.skipIf(process.platform !== 'darwin')('creates one scoped folder and reopens the verified credential draft', async () => {
  const groupId = await createGroup();
  mockFixtureEncryption();
  await withSetupFixture(async fixture => {
    const save = (name: string) => handleWebDavSyncCommand(NATIVE_COMMANDS.saveWebDavRelayDirectory, {
      group_id: groupId, directory_url: fixture.parent, credentials: fixtureCredentials, new_folder_name: name
    });
    const name = 'Foliole 测试';
    const target = `${fixture.parent}${encodeURIComponent(name)}/`;
    await expect(save(name)).resolves.toBe(target);
    expect(fixture.requests.map(request => request.split(' ')[0])).toEqual(['PROPFIND', 'PROPFIND', 'MKCOL', 'PROPFIND', 'PUT', 'MOVE', 'GET', 'DELETE']);
    expect(fixture.requests.slice(0, 3)).toEqual([
      'PROPFIND /storage/', `PROPFIND ${new URL(target).pathname}`, `MKCOL ${new URL(target).pathname}`
    ]);
    expect([...fixture.files]).toEqual([['/storage/keep.bin', 'parent file'], ['/storage/occupied/keep.bin', 'existing file']]);
    closeDatabaseConnection();
    expect(await loadDesktopWebDavRelayDirectory(groupId)).toEqual({ directory: null, credential_directory: target });
  });
});

// SKIP: macOS WebDAV credential flow | 2026-11-11 | revive: another host supports DAV credentials
it.skipIf(process.platform !== 'darwin')('preserves a saved connection and remote files when folder creation fails', async () => {
  const groupId = await createGroup();
  mockFixtureEncryption();
  await withSetupFixture(async fixture => {
    const saved = `${fixture.parent}occupied/`;
    await expect(saveDesktopWebDavRelayCredentials(groupId, fixture.parent, fixtureCredentials, 'occupied')).resolves.toBe(saved);
    expect(fixture.requests.some(request => request.startsWith('MKCOL'))).toBe(false);
    fixture.requests.length = 0;
    const save = (name: string, url = fixture.parent, credentials = fixtureCredentials) =>
      saveDesktopWebDavRelayCredentials(groupId, url, credentials, name);
    await expect(save('..')).rejects.toThrow('webdav_relay_invalid_folder_name');
    await expect(save('escaped%2fpath')).rejects.toThrow('webdav_relay_invalid_folder_name');
    expect(fixture.requests).toEqual([]);
    await expect(save('new', `${fixture.parent}missing/`)).rejects.toThrow('webdav_relay_parent_unavailable');
    await expect(save('new', fixture.parent, { ...fixtureCredentials, password: 'incorrect' })).rejects.toThrow('webdav_relay_folder_auth_failed');
    await expect(save('denied')).rejects.toThrow('webdav_relay_folder_creation_failed');
    expect(fixture.requests.filter(request => request.startsWith('MKCOL'))).toEqual(['MKCOL /storage/denied/']);
    expect(fixture.requests.every(request => /^(MKCOL|PROPFIND) /.test(request))).toBe(true);
    await expect(save('read-only')).rejects.toThrow('webdav_relay_created_but_unverified');
    expect(fixture.directories.has('/storage/read-only/')).toBe(true);
    expect([...fixture.files]).toEqual([['/storage/keep.bin', 'parent file'], ['/storage/occupied/keep.bin', 'existing file']]);
    closeDatabaseConnection();
    expect(await loadDesktopWebDavRelayDirectory(groupId)).toEqual({ directory: null, credential_directory: saved });
  });
});
