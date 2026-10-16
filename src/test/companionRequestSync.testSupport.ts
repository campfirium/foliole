import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterAll, beforeAll, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { postCompanionRequestFixture } from '../../electron/sync/companionRequestSyncHttp.testSupport.js';
import { createDesktopFramedSyncFiles } from '../../electron/sync/desktopFramedSyncFiles.js';
import { buildDesktopFramedSyncFixture, createDesktopFramedSyncTwoProcessFixture } from '../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { createDesktopSyncGroupSignedHeaders } from '../../electron/sync/desktopSyncGroupSignedHeaders.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { framedSyncFileKey, type FramedSyncFilePort } from '../../lib/core/sync/framedSyncFilePort.js';
import type { NativeRequestSyncHttpRequest } from '../../lib/platform/nativeRequestSyncHttpContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap.js';
import { rememberCompanionRequestSyncPeerState } from '../shared/platform/companion/sync/framed/companionRequestSyncPeerState.js';
import { closeCompanionSyncPeerRounds } from '../shared/platform/companion/sync/framed/companionSyncPeerRounds.js';
import { syncCompanionIdentityObjects } from '../shared/platform/companion/sync/syncGroupIdentityCompanionResult.js';
import type { CompanionDesktopSyncOptions } from '../shared/platform/companionDesktopSyncTypes.js';


const native = vi.hoisted(() => ({ db: null as DbPort | null,
  files: null as FramedSyncFilePort | null, post: vi.fn(), sign: vi.fn(), accessFile: vi.fn(), http: vi.fn(), cancelHttp: vi.fn(async () => {}) }));
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', async original => ({
  ...await original<typeof import('../shared/platform/companionWorkspaceRuntimeRepository')>(), FolioleCompanionSync: {
  postRequestSyncHttp: native.post, signCompanionSyncRequest: native.sign, accessFramedSyncFile: native.accessFile,
  desktopHttpRequest: native.http, cancelRequestSyncHttp: native.cancelHttp
} }));
vi.mock('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', () => {
  const owner = {
    databasePath: '/fixture',
    read: (task: (db: DbPort) => unknown) => task(native.db!),
    readSnapshot: (task: (db: DbPort) => unknown) => task(native.db!),
    runWriter: (task: (db: DbPort) => unknown) => task(native.db!)
  };
  return { getIosCompanionDatabaseOwner: () => owner };
});
vi.mock('../shared/platform/companion/runtime/companionFramedPayloadBudget.js', () => ({ companionFramedFileOwner: () => ({
  library_key: '/fixture', generation_id: 'generation'
}) }));
vi.mock('../shared/platform/companion/sync/framed/companionFramedSyncFiles.js', () => ({
  currentCompanionFramedSyncFiles: () => native.files!, createCompanionFramedSyncFiles: () => native.files!
}));
vi.mock('../shared/platform/appLifecycle.js', () => ({ readNativeAppActiveState: async () => true,
  subscribeNativeAppBackground: async () => () => undefined }));

export { native };

let compiledDirectory: string;
let compiledScript: string;
beforeAll(async () => {
  compiledDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-request-script-'));
  compiledScript = path.join(compiledDirectory, 'fixture.mjs');
  await buildDesktopFramedSyncFixture(compiledScript);
}, 20000);
afterAll(async () => {
  if (compiledDirectory) await fs.rm(compiledDirectory, { recursive: true, force: true });
});

export async function createCompanionRequestFixture(script = compiledScript) {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(script, true, true);
  await fixture.left.synchronize(fixture.rightSnapshot.origin);
  let sqlite = open();
  function open() {
    const database = new Database(fixture.leftSnapshot.databasePath);
    database.exec('CREATE TABLE IF NOT EXISTS companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
    database.prepare("INSERT OR REPLACE INTO companion_meta VALUES ('host_name', 'Mobile', 'now')").run();
    native.db = createBetterSqliteDbPort(database);
    return database;
  }
  const fileRoot = path.join(fixture.root, 'mobile-files');
  const durableFiles = createDesktopFramedSyncFiles(fileRoot);
  native.files = {
    ...durableFiles,
    async write(key, bytes) {
      if (!key.startsWith('requests/')) return durableFiles.write(key, bytes);
      // Match Android FramedSyncFiles: HTTP request chunks are transient scratch files.
      const file = path.join(fileRoot, framedSyncFileKey(...key.split('/')));
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes);
    }
  };
  const post = (input: NativeRequestSyncHttpRequest) => postCompanionRequestFixture(native.files!, input);
  native.post.mockImplementation(post);
  native.accessFile.mockImplementation(async (input: { action: string; key: string }) => {
    if (!['source-stat', 'source-open'].includes(input.action)) throw new Error(`fixture_attachment_action_unavailable:${input.action}`);
    const file = path.join(fixture.leftSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', input.key);
    const info = await fs.stat(file).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    return { present: Boolean(info), length: info?.size ?? 0, hash: info ? createHash('sha256').update(await fs.readFile(file)).digest('hex') : '' };
  });
  native.sign.mockImplementation(input => ({ headers: createDesktopSyncGroupSignedHeaders({
    groupId: input.sync_group_id, localDeviceId: fixture.leftSnapshot.deviceId, method: input.method,
    pathWithQuery: input.path_with_query, bodySha256: input.body_hash, secret: Buffer.alloc(32, 7).toString('base64url')
  }) }));
  const peer = { deviceId: fixture.rightSnapshot.deviceId,
    libraryEpoch: `${fixture.rightSnapshot.deviceId}-epoch`, protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version };
  rememberCompanionRequestSyncPeerState({ contract_version: 3, group_id: 't326-group',
    sender_device_identity_key: peer.deviceId, library_epoch: peer.libraryEpoch,
    proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null }, true);
  return {
    fixture, post, get sqlite() { return sqlite; }, get db() { return native.db!; },
    sync: (options: Pick<CompanionDesktopSyncOptions, 'waitForInbound' | 'onProgress' | 'signal' | 'onDatabaseConfirmed' | 'onStructureSynced'> = {}) =>
      syncCompanionIdentityObjects(fixture.rightSnapshot.origin, { ...options, framedPeer: peer }),
    async restart() {
      closeCompanionSyncPeerRounds(getIosCompanionDatabaseOwner());
      sqlite.close(); await fixture.restartLeft(); sqlite = open();
    },
    async close() {
      closeCompanionSyncPeerRounds(getIosCompanionDatabaseOwner());
      sqlite.close(); native.db = null; native.files = null;
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
      await fs.rm(fixture.root, { recursive: true, force: true });
      vi.resetAllMocks();
    }
  };
}
