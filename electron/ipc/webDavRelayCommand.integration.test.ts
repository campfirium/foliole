// @vitest-environment node

import { createHash, createPublicKey, diffieHellman, hkdfSync, randomUUID, sign } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { readWebDavRelayBodyScope } from '../../lib/core/sync/webDavRelayBodyScope.js';
import { captureWebDavRelayLanBaseline } from '../../lib/core/sync/webDavRelayLanBaseline.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { webDavCredentialTranscript } from '../../lib/platform/webDavCredentialDeliveryContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from '../database/syncGroupStore.js';
import { createDesktopRequestSyncDatabaseHost } from '../sync/desktopRequestSyncDatabaseHost.js';
import { desktopSyncChangeSessions } from '../sync/desktopSyncChangeSessions.js';
import { createWebDavCredentialKey, webDavCredentialProof } from '../sync/desktopWebDavCredentialCrypto.js';
import { desktopWebDavCredentialDeliveryForPeer, handleDesktopWebDavCredentialReply } from '../sync/desktopWebDavCredentialDelivery.js';
import { confirmDesktopWebDavRelayDelivery, desktopWebDavRelayForPeer, loadDesktopBoundWebDavRelay } from '../sync/desktopWebDavRelaySettings.js';
import { withWebDavFixture } from '../sync/webDavRelay.testSupport.js';

import { handleInvokeRequest } from './commands.js';
import { prepareCredentialCommandFixture } from './webDavRelayCredentialCommand.testSupport.js';

let root = '';
const openPath = vi.hoisted(() => vi.fn());
vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
    app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
  })
}));
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  app: { getName: () => 'Foliole', getVersion: () => 'test', getPath: () => root },
  safeStorage: { isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (plain: string) => Buffer.from(plain),
    decryptStringAsync: async (cipher: Buffer) => ({ result: cipher.toString() }) },
  shell: { openPath }, dialog: {}, ipcMain: {}, nativeImage: {}, clipboard: {}, Menu: {},
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
  vi.restoreAllMocks();
  closeDatabaseConnection();
  Object.defineProperty(process, 'platform', platform);
  await fs.rm(root, { recursive: true, force: true });
});

it.each(['initial setup', 'replacement'] as const)(
  'activates credentials only after both fingerprints and the phone installation receipt during %s',
  async mode => {
    const phone = registerPhone('Android phone');
    const other = registerPhone('Other phone');
    const mac = await prepareCredentialCommandFixture(groupId, directory, phone, other);
    const scopeKey = `webdav_relay_directory:${groupId}:${mac}`;
    const bindingKey = `${scopeKey}:binding`;
    const existing = mode === 'replacement' ? { id: randomUUID(), group_id: groupId, desktop_device_id: mac,
      phone_device_id: phone, directory_url: directory, credential_version: Date.now() + 60_000, delivered: true } : null;
    if (existing) saveJsonSetting(bindingKey, existing);
    const previous = loadDesktopBoundWebDavRelay();
    await handleInvokeRequest({ command: NATIVE_COMMANDS.enableWebDavRelay,
      args: { group_id: groupId, device_id: phone, authenticated: true } });
    expect(desktopWebDavCredentialDeliveryForPeer(groupId, other)).toBeUndefined();
    const { offer } = desktopWebDavCredentialDeliveryForPeer(groupId, phone)!;
    if (existing) {
      expect(offer.binding.id).toBe(existing.id);
      expect(offer.version).toBeGreaterThan(existing.credential_version);
    }
    const receiver = createWebDavCredentialKey();
    const identity = existing ? createWebDavCredentialKey() : undefined;
    const transcriptBytes = Buffer.from(webDavCredentialTranscript(offer, receiver.publicKey, identity?.publicKey));
    const signature = identity && sign('sha256', transcriptBytes, identity.privateKey).toString('base64url');
    const send = (proof: { confirmation?: string; receipt?: string; phone_identity_proof?: string } = {}) =>
      runWithDatabaseConnectionOwner(() => handleDesktopWebDavCredentialReply(groupId, phone, {
        id: offer.id, phone_key: receiver.publicKey, phone_identity_key: identity?.publicKey, ...proof
      }));
    if (identity) await expect(send({ phone_identity_proof: 'invalid' })).rejects.toThrow('webdav_credential_delivery_invalid');
    await send(signature ? { phone_identity_proof: signature } : {});
    const overview = await handleInvokeRequest({ command: NATIVE_COMMANDS.loadSyncGroupOverview, args: {} }) as {
      webdav_relay: { credential_delivery: { fingerprint: string } }
    };
    const fingerprint = overview.webdav_relay.credential_delivery.fingerprint;
    const confirm = (code: string) => handleInvokeRequest({ command: NATIVE_COMMANDS.confirmWebDavCredentialDelivery,
      args: { group_id: groupId, id: offer.id, fingerprint: code, username: 'phone-user', password: 'phone-password' } });
    await expect(confirm('wrong')).rejects.toThrow('webdav_credential_delivery_invalid');
    await confirm(fingerprint);
    expect(desktopWebDavCredentialDeliveryForPeer(groupId, phone)?.envelope).toBeUndefined();
    const transcript = createHash('sha256').update(transcriptBytes).digest();
    const desktop = createPublicKey({ key: Buffer.from(offer.desktop_key, 'base64url'), format: 'der', type: 'spki' });
    const secret = diffieHellman({ privateKey: receiver.privateKey, publicKey: desktop });
    const proofKey = (label: string) => Buffer.from(hkdfSync('sha256', secret, transcript, `WebDAV credential ${label}`, 32));
    expect(fingerprint).toBe(transcript.subarray(0, 16).toString('hex'));
    await send({ confirmation: webDavCredentialProof(proofKey('confirmation'), 'confirmed') });
    expect(desktopWebDavCredentialDeliveryForPeer(groupId, phone)?.envelope).toBeDefined();
    expect(loadDesktopBoundWebDavRelay()).toEqual(previous);
    await expect(send({ receipt: 'forged' })).rejects.toThrow('webdav_credential_delivery_invalid');
    expect(loadDesktopBoundWebDavRelay()).toEqual(previous);
    await send({ receipt: webDavCredentialProof(proofKey('receipt'), 'installed') });
    closeDatabaseConnection();
    expect(loadDesktopBoundWebDavRelay()).toMatchObject({ id: offer.binding.id,
      phone_device_id: phone, credential_version: offer.version });
    expect(desktopWebDavRelayForPeer(groupId, phone)).toBeUndefined();
    expect(loadJsonSetting(`${scopeKey}:credential-peer-identity`)).toEqual(identity ? {
      binding_id: offer.binding.id, library_epoch: offer.desktop_identity!.library_epoch,
      peer_library_epoch: offer.library_epoch, public_key: identity.publicKey
    } : null);
  }
);

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

it('opens only the local WebDAV log through IPC and keeps failed probe details private', async () => {
  openPath.mockResolvedValue('');
  const file = path.join(root, 'logs', 'webdav-sync.txt');
  const openLog = () => handleInvokeRequest({ command: NATIVE_COMMANDS.openWebDavRelayLog, args: { path: '/untrusted.txt' } });
  await expect(openLog()).resolves.toBeNull();
  expect(openPath).toHaveBeenLastCalledWith(file);
  expect(await fs.readFile(file, 'utf8')).toBe('');

  await withWebDavFixture(true, async url => {
    const save = (directoryUrl: string) => handleInvokeRequest({
      command: NATIVE_COMMANDS.saveWebDavRelayDirectory, args: { group_id: groupId, directory_url: directoryUrl }
    });
    await expect(save(url.replace('://', '://hidden-user:hidden-password@'))).rejects.toThrow('Invalid WebDAV folder URL');
    await expect(save(url)).rejects.toThrow('different test data');
    const log = await fs.readFile(file, 'utf8');
    const [invalid, failed] = log.trim().split('\n').map(line => JSON.parse(line));
    expect(invalid).toMatchObject({ status: 'failed', requests: {}, uploadedBytes: 0, downloadedBytes: 0 });
    expect(failed).toMatchObject({ status: 'failed', requests: { PROPFIND: 1, PUT: 1, MOVE: 1, GET: 1, DELETE: 2 },
      responses: 6, httpStatuses: { PROPFIND: { 207: 1 }, GET: { 200: 1 }, DELETE: { 204: 1, 404: 1 } }, uploadedBytes: 36 });
    expect(failed.downloadedBytes).toBeGreaterThan(0);
    for (const secret of [url, 'hidden-user', 'hidden-password', 'different test data']) expect(log).not.toContain(secret);
  });
  openPath.mockResolvedValueOnce('private system error');
  await expect(openLog()).rejects.toThrow('webdav_log_open_failed');
});
