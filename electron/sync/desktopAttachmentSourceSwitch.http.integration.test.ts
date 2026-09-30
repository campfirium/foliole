// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { publishAttachmentLibraryPathSnapshot,
  clearAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { openDatabaseConnection, type DatabaseConnection } from '../database/connection.js';
import { mockedSyncPackBuilderAppDataDir, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { compileAttachmentHttpWorker } from './desktopAttachmentHttpProcess.testSupport.js';
import { seedGroup, writeAttachmentFixture } from './desktopAttachmentRanges.http.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { hashResourceFile } from './resourceAvailability.js';

interface SourceScope { connection: DatabaseConnection; assetsDir: string; }
const fixture = vi.hoisted(() => ({ routing: null as AsyncLocalStorage<SourceScope> | null }));
vi.mock('../database/connection.js', async (original) => {
  const actual = await original<typeof import('../database/connection.js')>();
  return { ...actual,
    openDatabaseConnection: () => fixture.routing?.getStore()?.connection ?? actual.openDatabaseConnection(),
    runWithDatabaseConnectionOwner<T>(task: () => T | Promise<T>) {
      return fixture.routing?.getStore() ? Promise.resolve().then(task) : actual.runWithDatabaseConnectionOwner(task);
    }
  };
});
vi.mock('../attachments/attachmentLibraryPathSnapshot.js', async (original) => {
  const actual = await original<typeof import('../attachments/attachmentLibraryPathSnapshot.js')>();
  return { ...actual, readAttachmentLibraryPathSnapshot: () => {
    const scope = fixture.routing?.getStore();
    return scope ? { assetsDir: scope.assetsDir, libraryScope: 'source-b' } : actual.readAttachmentLibraryPathSnapshot();
  } };
});
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir, app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: fixture.routing?.getStore() ? 'source-b' : 'source',
  devices: ['source', 'source-b', 'receiver'].map((device_identity_key) => ({ device_identity_key, state: 'active' }))
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group', group_key: Buffer.alloc(32, 7).toString('base64url'),
    group_tag: 'test-tag' }), consumeDesktopWorkgroupNonce: () => true
}));
fixture.routing = new AsyncLocalStorage<SourceScope>();
setupSyncPackBuilderTestLifecycle();

async function prepareIndependentSources() {
  const driver = seedGroup();
  driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
      platform, state, joined_at, updated_at)
    VALUES ('group', 'source-b', 'source-b', '/source-b', 'Source B', 'mac', 'active', 'now', 'now')`);
  const root = resolveSyncPackPath('switch-http');
  const secondAssets = path.join(root, 'second-assets');
  await fs.mkdir(secondAssets, { recursive: true });
  const bytes = 3 * 1048576 + 17;
  const { hash, sourcePath } = await writeAttachmentFixture(root, bytes);
  await fs.copyFile(sourcePath, path.join(secondAssets, `${hash}.png`));
  driver.execute(`INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
    VALUES (?, 'source.png', 'image/png', ?, 'now')`, [hash, bytes]);
  const dbPath = path.join(root, 'source-b.db');
  await openDatabaseConnection().sqlite.backup(dbPath);
  const sqlite = new Database(dbPath);
  sqlite.prepare("UPDATE sync_group_local_state SET local_device_identity_key='source-b'").run();
  const secondConnection = { sqlite, driver: createBetterSqlite3Driver(sqlite), dbPath, searchDbPath: dbPath + '.search' };
  return { root, hash, bytes, sourcePath, secondAssets, secondConnection };
}

it('resumes the confirmed prefix from a different independent source over authenticated HTTP after receiver restart', async () => {
  const data = await prepareIndependentSources();
  publishAttachmentLibraryPathSnapshot({ assetsDir: data.root, libraryScope: 'source-a' });
  markDesktopSyncGroupMemberStateReady('receiver');
  const first = await startAuthenticatedSyncHttp();
  let firstClosed = false;
  const second = await fixture.routing!.run({ connection: data.secondConnection, assetsDir: data.secondAssets },
    () => startAuthenticatedSyncHttp({ sourceDeviceId: 'source-b' }));
  const filePath = path.join(data.root, 'received.png');
  try {
    const worker = await compileAttachmentHttpWorker(data.root);
    const run = promisify(execFile);
    const options = { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 120_000 };
    await expect(run(process.execPath, [worker, first.origin, filePath, data.hash, String(data.bytes), 'kill'], options))
      .rejects.toMatchObject({ signal: 'SIGKILL' });
    const checkpoint = new Database(filePath + '.db');
    expect(checkpoint.prepare('SELECT confirmed_bytes FROM attachment_receive_checkpoints').pluck().get()).toBe(2097152);
    checkpoint.close();
    await first.close();
    firstClosed = true;
    await fs.rm(data.sourcePath);
    const resumed = JSON.parse((await run(process.execPath,
      [worker, second.origin, filePath, data.hash, String(data.bytes), 'resume'], options)).stdout);
    expect(resumed.offsets).toEqual([0, 2097152, 3145728]);
    expect(resumed.checkpoints).toBe(0);
    expect(await hashResourceFile(filePath)).toBe(data.hash);
    expect(await hashResourceFile(path.join(data.secondAssets, `${data.hash}.png`))).toBe(data.hash);
    await fs.mkdir('.tmp/artifacts/T267', { recursive: true });
    await fs.writeFile('.tmp/artifacts/T267/authenticated-source-switch.json', JSON.stringify({
      bytes: data.bytes, hash: data.hash, sourceA: first.origin, sourceB: second.origin,
      confirmedBeforeRestart: 2097152, ...resumed
    }, null, 2));
  } finally {
    if (!firstClosed) await first.close();
    await second.close();
    data.secondConnection.sqlite.close();
    revokeDesktopSyncGroupMemberStateReadiness('receiver');
    clearAttachmentLibraryPathSnapshot();
  }
}, 150_000);
