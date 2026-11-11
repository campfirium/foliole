import { randomUUID } from 'node:crypto';

import { hasWebDavRelayPublishedChanges } from '../../lib/core/sync/webDavRelayBodyOutbox.js';
import { readWebDavRelayBodyScope } from '../../lib/core/sync/webDavRelayBodyScope.js';
import { DEFAULT_WEB_DAV_ATTACHMENT_POLICY, webDavAttachmentPolicySchema, webDavRelayBindingSchema,
  type WebDavRelayBinding } from '../../lib/platform/webDavRelayContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadJsonSetting, saveJsonSetting, writeJsonSetting } from '../database/settingsStore.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import {
  decryptDesktopWebDavCredentialDraft, encryptDesktopWebDavCredentialDraft,
  replaceDesktopWebDavCredentialCiphertext
} from '../security/desktopWebDavCredentialStore.js';

import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';
import { notifyDesktopSyncGroupOverviewChanged } from './desktopSyncGroupOverviewNotifier.js';
import { hasDesktopWebDavCredentialDraft, readCredentialOwner, requireActiveGroupKey,
  verifyCredentialOwner } from './desktopWebDavCredentialSettings.js';
import { recordDesktopWebDavUsage } from './desktopWebDavUsage.js';
import { testWebDavRelayConnection } from './testWebDavRelayConnection.js';

export async function loadDesktopWebDavRelayDirectory(groupId: unknown) {
  const state = await runWithDatabaseConnectionOwner(() => {
    const key = requireActiveGroupKey(groupId);
    const value = loadJsonSetting(key);
    return { directory: typeof value === 'string' ? value : null,
      owner: process.platform === 'darwin' ? readCredentialOwner(key) : null };
  });
  const { owner } = state;
  const draft = owner?.ciphertext ? await decryptDesktopWebDavCredentialDraft(owner.scope, owner.ciphertext) : null;
  if (draft && owner) await runWithDatabaseConnectionOwner(() => verifyCredentialOwner(owner, groupId));
  return { directory: state.directory, credential_directory: draft?.directory ?? null };
}

export function prepareAuthenticatedWebDavBinding(groupId: string, phoneId: string, directory: string, reserve = false) {
  const key = requireActiveGroupKey(groupId);
  const group = loadDesktopSyncGroup()!;
  const saved = loadBinding(key);
  const phone = group.devices.find(device => device.device_identity_key === phoneId);
  const epoch = openDatabaseConnection().driver.queryOne<{ library_epoch: string }>(
    'SELECT library_epoch FROM node_version_device_revisions WHERE group_id = ? AND device_identity_key = ? AND blocked_reason IS NULL',
    [groupId, phoneId]
  )?.library_epoch;
  if (process.platform !== 'darwin' || !epoch || phone?.state !== 'active' ||
    !phone.platform.toLowerCase().startsWith('android') || !desktopSyncChangeSessions().hasSessions(phoneId)) {
    throw new Error('webdav_relay_device_unavailable');
  }
  if (saved && (saved.binding.phone_device_id !== phoneId || saved.binding.directory_url !== directory)) {
    throw new Error('webdav_relay_bound');
  }
  const candidateKey = `${key}:credential-candidate`;
  const candidate = webDavRelayBindingSchema.safeParse(loadJsonSetting(candidateKey)).data;
  const matching = candidate?.phone_device_id === phoneId && candidate.directory_url === directory;
  const reservedVersion = matching ? candidate.credential_version : undefined;
  const activeVersion = saved?.binding.credential_version ?? 0;
  const version = reserve ? Math.max(Date.now(), (candidate?.credential_version ?? 0) + 1, activeVersion + 1)
    : reservedVersion;
  if (version === undefined || !Number.isSafeInteger(version) || version <= activeVersion) {
    throw new Error('webdav_relay_scope_changed');
  }
  const binding = { id: saved?.binding.id ?? (matching ? candidate.id : randomUUID()), group_id: groupId,
    desktop_device_id: group.local_device_identity_key, phone_device_id: phoneId, directory_url: directory,
    attachment_policy: loadAttachmentPolicy(key) } satisfies WebDavRelayBinding;
  if (reserve) saveJsonSetting(candidateKey, { ...binding, credential_version: version });
  return { epoch, binding, version };
}

export function activateAuthenticatedWebDavBinding(binding: WebDavRelayBinding, version: number,
  owner: ReturnType<typeof readCredentialOwner>, expectedEpoch: string, phoneIdentityKey?: string) {
  verifyCredentialOwner(owner, binding.group_id);
  const { epoch, binding: current, version: reservedVersion } = prepareAuthenticatedWebDavBinding(
    binding.group_id, binding.phone_device_id, binding.directory_url
  );
  if (version !== reservedVersion || epoch !== expectedEpoch || current.desktop_device_id !== binding.desktop_device_id ||
    current.id !== binding.id) {
    throw new Error('webdav_relay_scope_changed');
  }
  const key = requireActiveGroupKey(binding.group_id);
  openDatabaseConnection().driver.transaction(driver => {
    writeJsonSetting(driver, key, binding.directory_url);
    writeJsonSetting(driver, `${key}:binding`, { ...current, delivered: true, credential_version: version });
    writeJsonSetting(driver, `${key}:credential-peer-identity`, phoneIdentityKey ? {
      binding_id: binding.id, library_epoch: owner.libraryEpoch, peer_library_epoch: epoch, public_key: phoneIdentityKey
    } : null);
    writeJsonSetting(driver, `${key}:credential-candidate`, null);
  });
}

export async function saveDesktopWebDavRelayCredentials(groupId: unknown, input: unknown, credentials: unknown) {
  if (process.platform !== 'darwin') throw new Error('webdav_relay_host_unavailable');
  if (!credentials || typeof credentials !== 'object' ||
    !('username' in credentials) || typeof credentials.username !== 'string' ||
    !('password' in credentials) || typeof credentials.password !== 'string') {
    throw new Error('webdav_relay_invalid_credentials');
  }
  const previous = await runWithDatabaseConnectionOwner(() => readCredentialOwner(requireActiveGroupKey(groupId)));
  const { username, password } = credentials;
  try {
    const directory = await testWebDavRelayConnection(input, { recordUsage: recordDesktopWebDavUsage, credentials: { username, password } });
    const encrypted = await encryptDesktopWebDavCredentialDraft({ scope: previous.scope, directory, username, password });
    return await runWithDatabaseConnectionOwner(() => {
      verifyCredentialOwner(previous, groupId);
      const saved = loadBinding(requireActiveGroupKey(groupId))?.binding;
      if (saved && (saved.credential_version !== undefined || saved.directory_url !== directory)) {
        throw new Error('webdav_relay_bound');
      }
      replaceDesktopWebDavCredentialCiphertext(previous.scope, encrypted);
      return directory;
    });
  } finally {
    notifyDesktopSyncGroupOverviewChanged();
  }
}

export async function saveDesktopWebDavRelayDirectory(groupId: unknown, input: unknown) {
  const previous = await runWithDatabaseConnectionOwner(() => {
    const key = requireActiveGroupKey(groupId);
    return { key, connection: openDatabaseConnection(), directory: loadJsonSetting(key) };
  });
  const directory = await testWebDavRelayConnection(input, { recordUsage: recordDesktopWebDavUsage })
    .catch(error => {
      notifyDesktopSyncGroupOverviewChanged();
      throw error;
    });
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

function loadAttachmentPolicy(directoryKey: string) {
  return webDavAttachmentPolicySchema.safeParse(loadJsonSetting(`${directoryKey}:attachment-policy`)).data
    ?? DEFAULT_WEB_DAV_ATTACHMENT_POLICY;
}

export function saveDesktopWebDavAttachmentPolicy(groupId: unknown, input: unknown) {
  return runWithDatabaseConnectionOwner(() => {
    if (process.platform !== 'darwin') throw new Error('webdav_relay_host_unavailable');
    const key = requireActiveGroupKey(groupId);
    const policy = webDavAttachmentPolicySchema.parse(input);
    saveJsonSetting(`${key}:attachment-policy`, policy);
    desktopSyncChangeSessions().changed();
    notifyDesktopSyncGroupOverviewChanged();
    return policy;
  });
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
    attachment_policy: loadAttachmentPolicy(key),
    credential_draft_available: process.platform === 'darwin' && hasDesktopWebDavCredentialDraft(key),
    credential_active: saved?.binding.credential_version !== undefined,
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
  return saved?.binding.phone_device_id === peerId && saved.binding.credential_version === undefined
    ? { ...saved.binding, attachment_policy: loadAttachmentPolicy(key) } : undefined;
}

export function loadDesktopWebDavRelayForLanRound(groupId: string, peerId: string) {
  const saved = loadBinding(requireActiveGroupKey(groupId));
  if (saved?.binding.phone_device_id !== peerId) return undefined;
  return saved.delivered || saved.binding.credential_version === undefined ? saved.binding : undefined;
}

export function desktopWebDavAuthenticatedPolicyForPeer(groupId: string, peerId: string) {
  const key = requireActiveGroupKey(groupId);
  const saved = loadBinding(key)?.binding;
  return saved?.phone_device_id === peerId && saved.credential_version !== undefined
    ? { binding_id: saved.id, policy: loadAttachmentPolicy(key) } : undefined;
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
  const key = requireActiveGroupKey(group.group_id);
  const saved = loadBinding(key);
  if (!saved?.delivered || saved.binding.desktop_device_id !== group.local_device_identity_key) return null;
  return { ...saved.binding, attachment_policy: loadAttachmentPolicy(key) };
}

export async function loadDesktopWebDavRelayStatus() {
  const binding = loadDesktopBoundWebDavRelay();
  if (!binding) return { lan_baseline_required: false, published_via_relay: false };
  const db = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  const scope = await readWebDavRelayBodyScope(db, binding, binding.desktop_device_id);
  const published = scope && await hasWebDavRelayPublishedChanges(db, scope);
  return { lan_baseline_required: !scope, published_via_relay: Boolean(published) &&
    !desktopSyncChangeSessions().hasSessions(binding.phone_device_id) };
}
