import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import Database from 'better-sqlite3';
import { vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { buildRestoreFixture, startRestoreFixture } from '../../electron/sync/backupRestoreSyncGroup.testSupport.js';
import { postCompanionRequestFixture } from '../../electron/sync/companionRequestSyncHttp.testSupport.js';
import { createDesktopFramedSyncFiles } from '../../electron/sync/desktopFramedSyncFiles.js';
import { createDesktopSyncGroupSignedHeaders } from '../../electron/sync/desktopSyncGroupSignedHeaders.js';
import { decryptWorkgroupPayloadNode, encryptWorkgroupPayloadNode } from '../../electron/sync/workgroupAeadNode.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { FramedSyncFilePort } from '../../lib/core/sync/framedSyncFilePort.js';
import type { SyncGroupJoinDeviceFacts } from '../../lib/platform/syncGroupJoinContract.js';
import { devicePathFlavorFromCanonicalLibraryPath } from '../../lib/platform/syncGroupUnifiedContract.js';
import { createCompanionEditHistorySession, readConfirmedCompanionEditHistory } from '../shared/platform/companion/editing/companionEditHistorySession.js';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap.js';
import { closeCompanionSyncPeerRounds } from '../shared/platform/companion/sync/framed/companionSyncPeerRounds.js';
import { loadCurrentCredential } from '../shared/platform/companion/sync/syncGroupProviderCredentialStore.js';
import { FolioleCompanionSync } from '../shared/platform/companionWorkspaceRuntimeRepository.js';

const mobile = vi.hoisted(() => ({ db: null as DbPort | null, files: null as FramedSyncFilePort | null,
  facts: null as SyncGroupJoinDeviceFacts | null, post: vi.fn(), sign: vi.fn(), http: vi.fn() }));
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', async original => ({
  ...await original<typeof import('../shared/platform/companionWorkspaceRuntimeRepository')>(),
  isNativeCompanionNetworkRuntime: () => true, isAvailableNativeCompanionRuntime: () => true,
  beginNativeCompanionSyncRun: async () => {},
  FolioleCompanionSync: {
    loadSyncGroupDeviceIdentity: async () => mobile.facts,
    addListener: async () => ({ remove: async () => {} }),
    postRequestSyncHttp: mobile.post, signCompanionSyncRequest: mobile.sign, desktopHttpRequest: mobile.http,
    cancelRequestSyncHttp: async () => {},
    accessFramedSyncFile: async () => ({ presence: [] })
  }
}));
vi.mock('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', () => {
  const owner = { databasePath: '/fixture', read: (task: (db: DbPort) => unknown) => task(mobile.db!),
    readSnapshot: (task: (db: DbPort) => unknown) => task(mobile.db!),
    runWriter: (task: (db: DbPort) => unknown) => task(mobile.db!),
    getEditingHistory: () => readConfirmedCompanionEditHistory(mobile.db!) };
  return { getIosCompanionDatabaseOwner: () => owner };
});
vi.mock('../shared/platform/companion/runtime/companionFramedPayloadBudget.js', () => ({
  companionFramedFileOwner: () => ({ library_key: '/fixture', generation_id: 'generation' })
}));
vi.mock('../shared/platform/companion/sync/framed/companionFramedSyncFiles.js', () => ({
  currentCompanionFramedSyncFiles: () => mobile.files!, createCompanionFramedSyncFiles: () => mobile.files!
}));
vi.mock('../shared/platform/appLifecycle.js', () => ({ readNativeAppActiveState: async () => true,
  subscribeNativeAppEnteredBackground: async () => () => undefined,
  subscribeNativeAppBackground: async () => () => undefined,
  subscribeNativeAppForeground: async () => () => undefined }));
vi.mock('../shared/platform/companionRuntimeCapabilities', async original => ({
  ...await original<typeof import('../shared/platform/companionRuntimeCapabilities')>(),
  getCompanionRuntimeCapability: () => ({ kind: 'android-native', platform: 'android' })
}));

export { mobile };

const secret = Buffer.alloc(32, 7).toString('base64url');
const groupTag = createHash('sha256').update(Buffer.alloc(32, 7)).digest('hex').slice(0, 32);
function configureTransport(identity: string) {
  mobile.sign.mockImplementation(input => {
    const body = input.body === undefined ? undefined : JSON.stringify(encryptWorkgroupPayloadNode({
      context: { groupTag, direction: 'request', method: input.method,
        pathWithQuery: input.path_with_query, contentType: 'application/json; charset=utf-8' },
      groupKey: secret, plaintext: Buffer.from(input.body)
    }));
    return { headers: createDesktopSyncGroupSignedHeaders({ groupId: input.sync_group_id, localDeviceId: identity,
      method: input.method, pathWithQuery: input.path_with_query, secret,
      ...(body === undefined ? { bodySha256: input.body_hash } : { body }) }),
    ...(body === undefined ? {} : { body }) };
  });
  mobile.http.mockImplementation(async (input: RequestInit & { url: string }) => {
    const response = await fetch(input.url, input);
    const text = await response.text();
    const url = new URL(input.url);
    const body = response.headers.get('content-type')?.includes('workgroup-aead')
      ? decryptWorkgroupPayloadNode({ context: { groupTag, direction: 'response', method: input.method!,
        pathWithQuery: `${url.pathname}${url.search}`, contentType: 'application/json; charset=utf-8' },
      envelope: JSON.parse(text), groupKey: secret }).toString('utf8') : text;
    return { status: response.status, body };
  });
  mobile.post.mockImplementation(async input => {
    try { return await postCompanionRequestFixture(mobile.files!, input, {
      loadCredential: groupId => loadCurrentCredential({ group_id: groupId }),
      append: (key, offset, data) => FolioleCompanionSync.accessFramedSyncFile({ operation: 'attachment',
        action: 'append', key, offset, base64: Buffer.from(data).toString('base64'),
        library_key: input.library_key, generation_id: input.generation_id })
    }); }
    catch (error) {
      if (!(error instanceof Error) || !error.message.includes(':{"ciphertext"')) throw error;
      const url = new URL(input.url);
      const body = decryptWorkgroupPayloadNode({ context: { groupTag, direction: 'response', method: 'POST',
        pathWithQuery: `${url.pathname}${url.search}`, contentType: 'application/json; charset=utf-8' },
      envelope: JSON.parse(error.message.slice(error.message.indexOf(':') + 1)), groupKey: secret });
      throw new Error(`${error.message.slice(0, error.message.indexOf(':'))}:${body}`);
    }
  });
}

export async function createJoiningMobile() {
  await fs.mkdir('.tmp/artifacts/mobile-session', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.tmp/artifacts/mobile-session/join-'));
  await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'));
  const script = path.join(root, 'fixture.mjs');
  await buildRestoreFixture(script);
  const groupId = `group-${randomUUID()}`;
  const source = startRestoreFixture(script, path.join(root, 'Mobile'), 0);
  let provider = startRestoreFixture(script, path.join(root, 'Provider'), await freePort());
  const local = await source.send('init', { groupId, name: 'Mobile' });
  let peer = await provider.send('init', { groupId, name: 'Provider' });
  await source.send('leave');
  await source.close();
  await provider.send('joinProviderEnable');
  let sqlite = open();
  function open() {
    const db = new Database(local.database);
    db.exec('CREATE TABLE IF NOT EXISTS companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
    db.prepare("INSERT OR REPLACE INTO companion_meta VALUES ('host_name', 'Mobile', 'now')").run();
    mobile.db = createCompanionEditHistorySession(createBetterSqliteDbPort(db));
    return db;
  }
  mobile.facts = { canonical_library_path: local.device.canonical_library_path,
    device_anchor: local.device.device_anchor, device_name: 'Mobile', path_flavor: devicePathFlavorFromCanonicalLibraryPath(local.device.canonical_library_path), platform: 'android-capacitor' };
  const fileRoot = path.join(root, 'files');
  const files = createDesktopFramedSyncFiles(fileRoot);
  mobile.files = { ...files, async write(key, bytes) {
    if (!key.startsWith('requests/')) return files.write(key, bytes);
    const file = path.join(fileRoot, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
  } };
  configureTransport(local.identity);
  return { groupId, local, get peer() { return peer; }, get provider() { return provider; },
    get db() { return mobile.db!; }, get sqlite() { return sqlite; },
    reopen() { sqlite.close(); sqlite = open(); },
    async restartProvider() {
      const exited = new Promise<void>(resolve => provider.child.once('exit', () => resolve()));
      provider.child.kill();
      await exited;
      provider = startRestoreFixture(script, path.join(root, 'Provider'), await freePort());
      peer = await provider.send('init', { groupId, name: 'Provider', port: Number(new URL(peer.origin).port) });
    },
    async close() {
      closeCompanionSyncPeerRounds(getIosCompanionDatabaseOwner());
      sqlite.close(); mobile.db = null;
      await provider.close();
      await fs.rm(root, { recursive: true, force: true });
      vi.clearAllMocks();
    }
  };
}

async function freePort() {
  const server = net.createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture_port_missing');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

export async function approveJoiningMobile(host: Awaited<ReturnType<typeof createJoiningMobile>>) {
  const { requestCompanionSyncGroupJoin, completeCompanionSyncGroupJoin } =
    await import('../shared/platform/companionSyncGroupJoinClient.js');
  const pending = await requestCompanionSyncGroupJoin({ databasePath: host.local.database,
    endpointUrl: host.peer.origin, groupId: host.groupId, mode: 'use-group' });
  await host.provider.send('joinAccept', { requestId: pending.request_id });
  return completeCompanionSyncGroupJoin({ databasePath: host.local.database, endpointUrl: host.peer.origin,
    providerDeviceId: host.peer.identity, providerDeviceName: 'Provider', providerPlatform: process.platform,
    requestId: pending.request_id });
}

export async function syncJoinedMobile(host: Awaited<ReturnType<typeof createJoiningMobile>>) {
  const { exchangeCompanionSyncGroupMemberState } = await import('../shared/platform/companion/network/companionSyncGroupMemberState.js');
  const { syncCompanionIdentityObjects } = await import('../shared/platform/companion/sync/syncGroupIdentityCompanionResult.js');
  const { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } = await import('../../lib/platform/syncProtocolContract.js');
  const state = await exchangeCompanionSyncGroupMemberState({ endpointUrl: host.peer.origin,
    deviceId: host.peer.identity, groupId: host.groupId });
  if (!state.peerLibraryEpoch) throw new Error('fixture_peer_epoch_missing');
  return syncCompanionIdentityObjects(host.peer.origin, { framedPeer: { deviceId: host.peer.identity,
    libraryEpoch: state.peerLibraryEpoch, protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version } });
}
