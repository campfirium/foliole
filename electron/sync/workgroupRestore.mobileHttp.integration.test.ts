// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { receiveSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { mockedSyncPackBuilderAppDataDir, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { extractSyncPackDatabaseFromFile } from './syncPackContainerReader.js';

const ids = vi.hoisted(() => ({
  source: JSON.stringify([1, 'group', '11111111-1111-4111-8111-111111111111', '/source']),
  receiver: JSON.stringify([1, 'group', '22222222-2222-4222-8222-222222222222', '/receiver'])
}));
const mobile = vi.hoisted(() => ({ port: null as DbPort | null,
  server: null as Awaited<ReturnType<typeof startAuthenticatedSyncHttp>> | null,
  downloads: 0, runtimeKind: 'ios-native', push: vi.fn() }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: ids.source,
  devices: [ids.source, ids.receiver].map((device_identity_key) => ({ device_identity_key, state: 'active' }))
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
vi.mock('../../src/shared/platform/companionRuntimeCapabilities', async (original) => ({
  ...await original<Record<string, unknown>>(),
  getCompanionRuntimeCapability: () => ({ kind: mobile.runtimeKind }),
  requireAvailableCompanionRuntime: () => ({ kind: mobile.runtimeKind })
}));
vi.mock('../../src/shared/platform/companionBootstrap', () => ({
  loadCompanionBootstrapState: async () => ({ host_name: 'Mobile' })
}));
vi.mock('../../src/shared/platform/companion/sync/syncGroupStore', () => ({
  loadCompanionSyncGroup: async () => ({ group_id: 'group', local_device_identity_key: ids.receiver,
    devices: [{ device_identity_key: ids.receiver, state: 'active' }] })
}));
vi.mock('../../src/shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: async (task: (db: DbPort) => unknown) => task(mobile.port!),
    runWriter: async (task: (db: DbPort) => unknown) => task(mobile.port!)
  })
}));
vi.mock('../../src/shared/platform/companion/network/signedRequest', () => ({
  createSignedRequestHeaders: async () => ({})
}));
vi.mock('../../src/shared/platform/companion/network/syncGroupPeerIdentity', () => ({
  resolveCompanionSyncPeerId: async () => ids.source,
  resolveCompanionSyncPeerHostName: async () => 'Source'
}));
vi.mock('../../src/shared/platform/companionDesktopSyncPush', () => ({ pushLocalDirtyObjects: mobile.push }));
vi.mock('../../src/shared/platform/companionDesktopSyncHttp', async (original) => ({
  ...await original<Record<string, unknown>>(),
  fetchDesktopJson: async (_endpoint: string, route: string) => mobile.server!.getJson(route)
}));
vi.mock('../../src/shared/platform/companionSyncPackTransfer', () => ({
  downloadCompanionDesktopSyncPack: async ({ url }: { url: string }) => {
    const archive = await mobile.server!.archive(new URL(url));
    const file = resolveSyncPackPath(`restore-mobile-${mobile.downloads++}.db`);
    try {
      await extractSyncPackDatabaseFromFile({ archivePath: archive.filePath, outputPath: file,
        expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source });
      return file;
    } finally { await archive.cleanup(); }
  },
  deleteCompanionDownloadedSyncPack: async (file: string) => fs.rm(file)
}));
setupSyncPackBuilderTestLifecycle();

it.each(['ios-native', 'android-native'])('%s orchestration replaces obsolete and queued topics over HTTP and survives cold startup', async (runtimeKind) => {
  mobile.runtimeKind = runtimeKind;
  mobile.downloads = 0;
  mobile.push.mockClear();
  const event = seedSource();
  const file = resolveSyncPackPath('restore-mobile-library.db');
  let target = new Database(file);
  target.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  target.pragma('user_version = 54');
  seedGroup(target, ids.receiver);
  target.prepare("INSERT INTO companion_meta VALUES ('device_id', ?, 'now')").run(ids.receiver);
  target.exec("INSERT INTO companion_meta VALUES ('host_name', 'Mobile', 'now')");
  target.exec(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('drift', 'topic', 'Obsolete topic', 'Old body', 'now', 'now'),
      ('queued', 'topic', 'Unsent topic', 'Unsent body', 'now', 'now');
    INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash, updated_at, sync_dirty, last_modified_by_host_name)
      VALUES ('node', 'queued', 1, 'unsent', 'now', 1, 'Mobile');`);
  mobile.port = createBetterSqliteDbPort(target);
  await receiveSyncGroupRestoreEvent(mobile.port, event);
  markDesktopSyncGroupMemberStateReady(ids.receiver, 'restore');
  mobile.server = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source, receiverDeviceId: ids.receiver });
  try {
    // Renderer modules execute through Vite rather than Electron's NodeNext loader.
    const rendererPath = '../../src/shared/platform/companionDesktopSyncObjects';
    const { syncCompanionObjectsFromDesktop } = await import(rendererPath);
    await syncCompanionObjectsFromDesktop(mobile.server.origin, { restoreId: event.restore_id, includeResources: false });
    expect(mobile.downloads).toBeGreaterThan(1);
    expect(mobile.push).not.toHaveBeenCalled();
    assertAdopted(target);
    target.close();
    target = new Database(file);
    mobile.port = createBetterSqliteDbPort(target);
    await bootstrapCompanionDatabase(mobile.port, { allowCreate: false, expectedHostName: 'Mobile', now: event.restored_at });
    assertAdopted(target);
    expect(target.prepare('SELECT local_device_identity_key FROM sync_group_local_state').get())
      .toEqual({ local_device_identity_key: ids.receiver });
    expect(target.pragma('quick_check', { simple: true })).toBe('ok');
  } finally {
    await mobile.server.close();
    revokeDesktopSyncGroupMemberStateReadiness(ids.receiver);
    target.close();
  }
});

function assertAdopted(database: Database.Database) {
  expect(database.prepare('SELECT id FROM nodes ORDER BY id').pluck().all()).toEqual(['backup-a', 'backup-b']);
  expect(database.prepare(`SELECT n.id, v.body_text AS content FROM nodes n
    JOIN node_sync_versions v ON v.version_id = n.current_version_id ORDER BY n.id`).all()).toEqual([
    { id: 'backup-a', content: '# Backup A' }, { id: 'backup-b', content: '# Backup B' }
  ]);
  expect(database.prepare('SELECT applied_at FROM sync_group_restore_events').get())
    .toEqual({ applied_at: expect.any(String) });
  expect(database.prepare('SELECT object_id FROM sync_object_state WHERE sync_dirty = 1').all()).toEqual([]);
}

function seedGroup(database: Database.Database, localId: string) {
  database.exec("INSERT INTO sync_groups VALUES ('group', 'Group', 'secret', 'now', 'now')");
  database.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')").run(localId);
  for (const identity of [ids.source, ids.receiver]) {
    const [, , anchor, libraryPath] = JSON.parse(identity) as string[];
    database.prepare(`INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
        platform, state, joined_at, updated_at)
      VALUES ('group', ?, ?, ?, 'Device', 'mac', 'active', 'now', 'now')`).run(identity, anchor, libraryPath);
  }
}

function seedSource() {
  const { driver, sqlite } = openDatabaseConnection();
  seedGroup(sqlite, ids.source);
  for (const suffix of ['a', 'b']) upsertNodeSnapshot({ nodeId: `backup-${suffix}`,
    kind: 'topic', title: `Backup ${suffix}`, content: `# Backup ${suffix.toUpperCase()}`,
    parentNodeId: null, position: 0, isTitleManual: true, anchorLink: null, reveal: null,
    createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' });
  const event = { group_id: 'group', restore_id: 'restore-mobile-http',
    restored_at: '2026-09-30T00:00:00.000Z', source_device_identity_key: ids.source };
  driver.execute('INSERT INTO sync_group_restore_events VALUES (?, ?, ?, ?, ?, ?)',
    [event.restore_id, event.group_id, event.restored_at, ids.source, event.restored_at, event.restored_at]);
  driver.execute('UPDATE sync_state_sequence SET source_epoch = ?', [event.restore_id]);
  return event;
}
