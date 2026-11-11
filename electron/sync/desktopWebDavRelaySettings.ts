import { randomUUID } from 'node:crypto';

import { webDavRelayBindingSchema, type WebDavRelayBinding } from '../../lib/platform/webDavRelayContract.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';
import { notifyDesktopSyncGroupOverviewChanged } from './desktopSyncGroupOverviewNotifier.js';
import { testWebDavRelayConnection } from './testWebDavRelayConnection.js';

function requireActiveGroupKey(groupId: unknown) {
  const group = loadDesktopSyncGroup();
  if (!group || group.group_id !== groupId) throw new Error('sync_group_not_available');
  return `webdav_relay_directory:${group.group_id}:${group.local_device_identity_key}`;
}

export function loadDesktopWebDavRelayDirectory(groupId: unknown) {
  return runWithDatabaseConnectionOwner(() => {
    const value = loadJsonSetting(requireActiveGroupKey(groupId));
    return typeof value === 'string' ? value : null;
  });
}

export async function saveDesktopWebDavRelayDirectory(groupId: unknown, input: unknown) {
  const previous = await runWithDatabaseConnectionOwner(() => {
    const key = requireActiveGroupKey(groupId);
    return { key, connection: openDatabaseConnection(), directory: loadJsonSetting(key) };
  });
  const directory = await testWebDavRelayConnection(input);
  return runWithDatabaseConnectionOwner(() => {
    const key = requireActiveGroupKey(groupId);
    if (previous.key !== key || previous.connection !== openDatabaseConnection() ||
      previous.directory !== loadJsonSetting(key)) {
      throw new Error('webdav_relay_settings_changed');
    }
    if (loadBinding(key) && previous.directory !== directory) throw new Error('webdav_relay_bound');
    saveJsonSetting(key, directory);
    notifyDesktopSyncGroupOverviewChanged();
    return directory;
  });
}

function loadBinding(directoryKey: string) {
  const stored = loadJsonSetting(`${directoryKey}:binding`);
  if (!stored || typeof stored !== 'object') return null;
  const parsed = webDavRelayBindingSchema.safeParse(stored);
  if (!parsed.success) return null;
  return { binding: parsed.data, delivered: 'delivered' in stored && stored.delivered === true };
}

export function desktopWebDavRelayOverview(groupId: string) {
  const key = requireActiveGroupKey(groupId);
  const saved = loadBinding(key);
  const group = loadDesktopSyncGroup()!;
  const sessions = desktopSyncChangeSessions();
  const availableDeviceIds = group.devices.filter(device => device.state === 'active' &&
    device.device_identity_key !== group.local_device_identity_key && device.platform.toLowerCase().startsWith('android') &&
    sessions.hasSessions(device.device_identity_key)).map(device => device.device_identity_key);
  return {
    available_device_ids: availableDeviceIds,
    configured: typeof loadJsonSetting(key) === 'string',
    device_id: saved?.binding.phone_device_id ?? null,
    delivered: saved?.delivered ?? false
  };
}

export function enableDesktopWebDavRelay(groupId: unknown, phoneId: unknown) {
  return runWithDatabaseConnectionOwner(() => {
    const key = requireActiveGroupKey(groupId);
    const group = loadDesktopSyncGroup()!;
    const phone = group.devices.find(device => device.device_identity_key === phoneId);
    const directory = loadJsonSetting(key);
    const sessions = desktopSyncChangeSessions();
    if (process.platform !== 'darwin' || phone?.state !== 'active' || !phone.platform.toLowerCase().startsWith('android') ||
      typeof directory !== 'string' || !sessions.hasSessions(phone.device_identity_key)) {
      throw new Error('webdav_relay_device_unavailable');
    }
    const saved = loadBinding(key);
    if (saved && saved.binding.phone_device_id !== phoneId) throw new Error('webdav_relay_bound');
    if (!saved) saveJsonSetting(`${key}:binding`, {
      id: randomUUID(), group_id: group.group_id, desktop_device_id: group.local_device_identity_key,
      phone_device_id: phone.device_identity_key, directory_url: directory
    } satisfies WebDavRelayBinding);
    sessions.changed();
    notifyDesktopSyncGroupOverviewChanged();
  });
}

export function desktopWebDavRelayForPeer(groupId: string, peerId: string) {
  const key = requireActiveGroupKey(groupId);
  const saved = loadBinding(key);
  return saved?.binding.phone_device_id === peerId ? saved.binding : undefined;
}

export function confirmDesktopWebDavRelayDelivery(groupId: string, peerId: string, bindingId: string) {
  const key = requireActiveGroupKey(groupId);
  const saved = loadBinding(key);
  if (!saved || saved.delivered || saved.binding.phone_device_id !== peerId ||
    saved.binding.id !== bindingId) return;
  saveJsonSetting(`${key}:binding`, { ...saved.binding, delivered: true });
  notifyDesktopSyncGroupOverviewChanged();
}

export function loadDesktopBoundWebDavRelay() {
  if (process.platform !== 'darwin') return null;
  const group = loadDesktopSyncGroup();
  if (!group) return null;
  const saved = loadBinding(requireActiveGroupKey(group.group_id));
  if (!saved?.delivered || saved.binding.desktop_device_id !== group.local_device_identity_key) return null;
  return saved.binding;
}
