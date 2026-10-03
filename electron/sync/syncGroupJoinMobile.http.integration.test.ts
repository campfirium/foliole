// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { SyncGroupJoinDeviceFacts } from '../../lib/platform/syncGroupJoinContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { buildRestoreFixture, startRestoreFixture } from './backupRestoreSyncGroup.testSupport.js';

const mobile = vi.hoisted(() => ({ port: null as DbPort | null, facts: null as SyncGroupJoinDeviceFacts | null }));
vi.mock('../../src/shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: (task: (db: DbPort) => unknown) => task(mobile.port!),
    runWriter: (task: (db: DbPort) => unknown) => task(mobile.port!)
  })
}));
// Only the OS transport and device identity are substituted; HTTP, crypto, admission,
// local proof reads and membership/restore publication use the production implementations.
vi.mock('../../src/shared/platform/companionWorkspaceRuntimeRepository', () => ({
  normalizeEndpointUrl: (url: string) => url,
  isNativeCompanionNetworkRuntime: () => true,
  FolioleCompanionSync: {
    loadSyncGroupDeviceIdentity: async () => mobile.facts,
    desktopHttpRequest: async (args: RequestInit & { url: string }) => {
      const response = await fetch(args.url, args);
      return { status: response.status, body: await response.text() };
    }
  }
}));

let root = '';
let sqlite: Database.Database | null = null;
const workers: ReturnType<typeof startRestoreFixture>[] = [];
afterEach(async () => {
  sqlite?.close(); sqlite = null;
  await Promise.allSettled(workers.splice(0).map((worker) => worker.close()));
  if (root) await fs.rm(root, { recursive: true, force: true });
});

async function port() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function restoredApplicant(platform: string) {
  await fs.mkdir('.tmp/artifacts/sync-join', { recursive: true });
  root = await fs.mkdtemp(path.resolve('.tmp/artifacts/sync-join/mobile-'));
  await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const script = path.join(root, 'fixture.mjs');
  await buildRestoreFixture(script);
  const groupId = `group-${randomUUID()}`;
  const source = startRestoreFixture(script, path.join(root, 'Source'), await port());
  const provider = startRestoreFixture(script, path.join(root, 'Provider'), await port());
  workers.push(source, provider);
  const local = await source.send('init', { groupId, name: 'Source' });
  const peer = await provider.send('init', { groupId, name: 'Provider' });
  for (const worker of workers) await worker.send('register', { members: [
    { device: local.device, name: 'Source' }, { device: peer.device, name: 'Provider' }
  ] });
  await source.send('seed', { id: 'local-topic', content: 'Restored local data' });
  const backup = await source.send('backup');
  await provider.send('seed', { id: 'remote-topic', content: 'New remote data' });
  await provider.send('joinProviderEnable');
  await source.send('sync', { ...peer });
  await provider.send('sync', { ...local });
  await source.send('leave');
  await source.send('restoreLocal', { file: backup.destinationPath });
  await source.close();
  workers.shift();
  sqlite = new Database(local.database);
  mobile.port = createBetterSqliteDbPort(sqlite);
  mobile.facts = { canonical_library_path: local.device.canonical_library_path,
    device_anchor: local.device.device_anchor, device_name: 'Mobile', path_flavor: 'posix', platform };
  return { groupId, local, peer, provider };
}

it.each(['ios-capacitor', 'android-capacitor'])('%s preserves restore refusal over HTTP and explicitly joins by overwrite', async (platform) => {
  const { groupId, local, peer, provider } = await restoredApplicant(platform);
  const clientPath = '../../src/shared/platform/companionSyncGroupJoinClient';
  const { requestCompanionSyncGroupJoin, completeCompanionSyncGroupJoin } = await import(clientPath);
  const args = { databasePath: local.database, endpointUrl: peer.origin, groupId };
  const before = sqlite!.prepare('SELECT id, content FROM nodes ORDER BY id').all();
  await expect(requestCompanionSyncGroupJoin({ ...args, mode: 'merge' }))
    .rejects.toThrow('sync_group_merge_requires_overwrite');
  expect(sqlite!.prepare('SELECT id, content FROM nodes ORDER BY id').all()).toEqual(before);
  expect(sqlite!.prepare('SELECT * FROM sync_group_local_state').all()).toHaveLength(0);
  expect((await provider.send('joinOverview') as unknown as { join_requests: unknown[] }).join_requests).toHaveLength(0);
  expect((await provider.send('snapshot')).library.nodesById['remote-topic']?.content).toBe('New remote data');
  const pending = await requestCompanionSyncGroupJoin({ ...args, mode: 'overwrite' });
  await provider.send('joinAccept', { requestId: pending.request_id });
  const joined = await completeCompanionSyncGroupJoin({
    ...args, providerDeviceId: peer.identity, providerDeviceName: 'Provider',
    providerPlatform: 'darwin', requestId: pending.request_id
  });
  expect(joined.group_id).toBe(groupId);
  sqlite!.close(); sqlite = new Database(local.database);
  expect(sqlite.prepare('SELECT id, content FROM nodes ORDER BY id').all()).toEqual(before);
  expect(sqlite.prepare('SELECT group_id, source_device_identity_key FROM sync_group_restore_events').all())
    .toEqual([{ group_id: groupId, source_device_identity_key: local.identity }]);
  expect(sqlite.prepare('SELECT state FROM sync_group_local_state').get()).toEqual({ state: 'active' });
}, 90000);
