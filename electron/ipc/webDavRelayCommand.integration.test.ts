// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { saveJsonSetting } from '../database/settingsStore.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from '../database/syncGroupStore.js';
import { desktopSyncChangeSessions } from '../sync/desktopSyncChangeSessions.js';
import { desktopWebDavRelayForPeer } from '../sync/desktopWebDavRelaySettings.js';

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
