// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { readWebDavRelayBodyScope } from '../../lib/core/sync/webDavRelayBodyScope.js';
import { captureWebDavRelayLanBaseline } from '../../lib/core/sync/webDavRelayLanBaseline.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { saveJsonSetting } from '../database/settingsStore.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from '../database/syncGroupStore.js';
import { createDesktopRequestSyncDatabaseHost } from '../sync/desktopRequestSyncDatabaseHost.js';
import { desktopSyncChangeSessions } from '../sync/desktopSyncChangeSessions.js';
import { confirmDesktopWebDavRelayDelivery, desktopWebDavRelayForPeer } from '../sync/desktopWebDavRelaySettings.js';

import { handleInvokeRequest } from './commands.js';

let root = '';
vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
    app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
  })
}));
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  app: { getName: () => 'Foliole', getVersion: () => 'test', getPath: () => root },
  shell: {}, dialog: {}, ipcMain: {}, nativeImage: {}, clipboard: {}, Menu: {},
  systemPreferences: {}, screen: {}
}));

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const groupId = 'relay-test';
const directory = 'https://dav.example.test/relay/';

function deviceIdentity() {
  return createSyncGroupDeviceIdentity({
    device_anchor: randomUUID(), group_id: groupId, library_path: '/test/library', path_flavor: 'posix'
  });
}

function registerPhone(deviceName: string) {
  const device = deviceIdentity();
  registerSyncGroupDevice({ device, deviceName, platform: 'android' });
  return device.identity_key;
}

function enableRelay(deviceId: string) {
  return handleInvokeRequest({
    command: NATIVE_COMMANDS.enableWebDavRelay, args: { group_id: groupId, device_id: deviceId }
  });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-dav-ipc-'));
  initializeDatabase();
  Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });
  const group = createDesktopSyncGroup({ device: deviceIdentity(), deviceName: 'Test Mac', platform: 'darwin' });
  saveJsonSetting(`webdav_relay_directory:${groupId}:${group.local_device_identity_key}`, directory);
});

afterEach(async () => {
  closeDatabaseConnection();
  Object.defineProperty(process, 'platform', platform);
  await fs.rm(root, { recursive: true, force: true });
});

it('acknowledges enable through native IPC and persists the binding without replacing it', async () => {
  const phone = registerPhone('Android phone');
  const otherPhone = registerPhone('Other Android phone');
  await expect(enableRelay(phone)).rejects.toThrow('webdav_relay_device_unavailable');
  expect(desktopWebDavRelayForPeer(groupId, phone)).toBeUndefined();

  desktopSyncChangeSessions().open(phone);
  desktopSyncChangeSessions().open(otherPhone);
  const [reply] = await Promise.allSettled([enableRelay(phone)]);
  const binding = desktopWebDavRelayForPeer(groupId, phone);
  expect(binding).toMatchObject({ group_id: groupId, phone_device_id: phone, directory_url: directory });
  expect(reply).toEqual({ status: 'fulfilled', value: null });

  await expect(enableRelay(phone)).resolves.toBeNull();
  await expect(enableRelay(otherPhone)).rejects.toThrow('webdav_relay_bound');
  closeDatabaseConnection();
  expect(desktopWebDavRelayForPeer(groupId, phone)).toEqual(binding);
  expect(desktopWebDavRelayForPeer(groupId, otherPhone)).toBeUndefined();
});

it('reports current authenticated phone availability through the desktop overview IPC', async () => {
  const phone = registerPhone('Android phone');
  const otherPhone = registerPhone('Offline Android phone');
  const overview = () => handleInvokeRequest({ command: NATIVE_COMMANDS.loadSyncGroupOverview, args: {} });
  await expect(overview()).resolves.toMatchObject({ webdav_relay: { available_device_ids: [] } });

  const sessions = desktopSyncChangeSessions();
  const connected = sessions.open(phone);
  await expect(overview()).resolves.toMatchObject({ webdav_relay: { available_device_ids: [phone] } });
  await expect(enableRelay(otherPhone)).rejects.toThrow('webdav_relay_device_unavailable');

  sessions.close(phone, connected.session);
  await expect(overview()).resolves.toMatchObject({ webdav_relay: { available_device_ids: [] } });
});

it('reports when a delivered binding needs LAN sync again after a library epoch changes', async () => {
  const phone = registerPhone('Android phone');
  const sessions = desktopSyncChangeSessions();
  const connected = sessions.open(phone);
  try {
    await enableRelay(phone);
  } finally {
    sessions.close(phone, connected.session);
  }
  const binding = desktopWebDavRelayForPeer(groupId, phone)!;
  const overview = () => handleInvokeRequest({ command: NATIVE_COMMANDS.loadSyncGroupOverview, args: {} });
  const expectBaselineRequired = (required: boolean) => expect(overview()).resolves.toMatchObject({
    webdav_relay: { lan_baseline_required: required }
  });
  await expectBaselineRequired(false);
  confirmDesktopWebDavRelayDelivery(groupId, phone, binding.id);
  await expectBaselineRequired(true);

  const connection = openDatabaseConnection();
  const host = createDesktopRequestSyncDatabaseHost(connection.dbPath);
  const updatePhoneEpoch = connection.sqlite.prepare(`INSERT INTO node_version_device_revisions
    (group_id, device_identity_key, library_epoch, proof_revision, pack_id, updated_at)
    VALUES (?, ?, ?, 1, 'pack', 'now')
    ON CONFLICT(group_id, device_identity_key) DO UPDATE SET library_epoch = excluded.library_epoch`);
  const localEpoch = connection.sqlite.prepare('SELECT library_epoch FROM node_version_local_proof_state').pluck().get() as string;
  const confirmLanRound = async (phoneEpoch: string) => {
    const confirm = await captureWebDavRelayLanBaseline(host, binding, {
      groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: binding.desktop_device_id, initiatorLibraryEpoch: localEpoch,
      responderDeviceId: phone, responderLibraryEpoch: phoneEpoch
    }, 'initiator');
    expect(await confirm?.()).toBe(true);
  };

  updatePhoneEpoch.run(groupId, phone, 'original');
  await confirmLanRound('original');
  await expectBaselineRequired(false);
  const expectPublished = (published: boolean) => expect(overview()).resolves.toMatchObject({
    webdav_relay: { published_via_relay: published }
  });
  await expectPublished(false);
  const db = createBetterSqliteDbPort(connection.sqlite);
  const scope = (await readWebDavRelayBodyScope(db, binding, binding.desktop_device_id))!;
  await db.run('INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)',
    [`${scope.key}:outbox`, JSON.stringify({ sequence: scope.baseline.sequence + 1, packet: null }), 'now']);
  await expectPublished(true);
  const active = sessions.open(phone);
  try {
    await expectPublished(false);
  } finally {
    sessions.close(phone, active.session);
  }
  await expectPublished(true);
  updatePhoneEpoch.run(groupId, phone, 'restored');
  await expectPublished(false);
  await expectBaselineRequired(true);
  await confirmLanRound('restored');
  await expectBaselineRequired(false);
});
