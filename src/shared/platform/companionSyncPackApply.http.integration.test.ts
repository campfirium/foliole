// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../../../electron/database/connection.js';
import { mockedSyncPackBuilderAppDataDir, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle } from '../../../electron/database/syncPackBuilderTestSupport.js';
import { startAuthenticatedSyncHttp } from '../../../electron/sync/companionLanAuthenticatedHttp.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from '../../../electron/sync/desktopSyncGroupMemberStateReadiness.js';
import { extractSyncPackDatabaseFromFile } from '../../../electron/sync/syncPackContainerReader.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../../lib/core/database/companionSchemaStatements.js';
import type { DbPort } from '../../../lib/core/sync/dbPort.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../../lib/core/sync/syncPackNodeApplyExecutor.js';

const ids = vi.hoisted(() => ({
  source: JSON.stringify([1, 'group', '11111111-1111-4111-8111-111111111111', '/source']),
  receiver: JSON.stringify([1, 'group', '22222222-2222-4222-8222-222222222222', '/receiver'])
}));

vi.mock('../../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../../../electron/database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: ids.source,
  devices: [{ device_identity_key: ids.source, state: 'active' },
    { device_identity_key: ids.receiver, state: 'active' }]
}) }));
vi.mock('../../../electron/sync/workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('../../../electron/sync/workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
setupSyncPackBuilderTestLifecycle();

function seedSource() {
  const driver = openDatabaseConnection().driver;
  driver.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  driver.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')", [ids.source]);
  for (const [peerId, anchor, libraryPath] of [
    [ids.source, '11111111-1111-4111-8111-111111111111', '/source'],
    [ids.receiver, '22222222-2222-4222-8222-222222222222', '/receiver']
  ] as const) driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', ?, ?, ?, 'Device', 'mac', 'active', 'now', 'now')`,
  [peerId, anchor, libraryPath]);
  for (let seq = 1; seq <= 3; seq++) {
    const id = `deleted-${seq}`;
    driver.execute(`INSERT INTO node_sync_tombstones
      (node_id, version_id, parent_version_id, host_name, content_hash,
        snapshot_json, deleted_at, created_at)
      VALUES (?, ?, NULL, 'source', 'deleted', ?, 'now', 'now')`,
    [id, `version-${seq}`, JSON.stringify({ id, deleted_at: 'now' })]);
    driver.execute(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, updated_at,
        deleted_at, sync_dirty, last_modified_by_host_name)
      VALUES ('node', ?, ?, 'deleted', 'now', 'now', 0, 'source')`, [id, seq]);
  }
  driver.execute('UPDATE sync_state_sequence SET high_water = 3 WHERE singleton_id = 1');
}


function seedMixedSource(softDeleted = false) {
  seedSource();
  const driver = openDatabaseConnection().driver;
  driver.execute('DELETE FROM sync_object_state WHERE state_seq < 3');
  driver.execute("DELETE FROM node_sync_tombstones WHERE node_id <> 'deleted-3'");
  for (let seq = 1; seq <= 2; seq++) {
    const id = `live-${seq}`;
    driver.execute(`INSERT INTO nodes
      (id, kind, title, current_version_id, created_at, updated_at)
      VALUES (?, 'topic', ?, ?, 'now', 'now')`, [id, id, `version-${seq}`]);
    driver.execute(`INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at,
        content_hash, body_text, snapshot_json)
      VALUES (?, ?, NULL, 'source', 'now', ?, ?, ?)`,
    [`version-${seq}`, id, `hash-${seq}`, `body-${seq}`,
      JSON.stringify({ id, title: id, content: `body-${seq}` })]);
    driver.execute(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, updated_at,
        sync_dirty, last_modified_by_host_name)
      VALUES ('node', ?, ?, ?, 'now', 0, 'source')`, [id, seq, `hash-${seq}`]);
  }
  for (let seq = 4; seq <= 5; seq++) driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, updated_at,
      sync_dirty, last_modified_by_host_name)
    VALUES ('node', ?, ?, ?, 'now', 0, 'source')`,
  [`orphan-${seq}`, seq, `hash-orphan-${seq}`]);
  if (softDeleted) {
    driver.execute("UPDATE nodes SET deleted_at = 'now' WHERE id = 'live-2'");
    driver.execute("UPDATE sync_object_state SET deleted_at = 'now' WHERE object_id = 'live-2'");
  }
  const attachmentId = 'a'.repeat(64);
  driver.execute(`INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
    VALUES (?, 'sample.png', 'image/png', 12, 'now')`, [attachmentId]);
  driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, updated_at, sync_dirty, last_modified_by_host_name)
    VALUES ('attachment', ?, 6, 'hash-attachment', 'now', 0, 'source')`, [attachmentId]);
  driver.execute('UPDATE sync_state_sequence SET high_water = 6 WHERE singleton_id = 1');
}

const receiver = vi.hoisted(() => ({
  port: null as DbPort | null,
  server: null as Awaited<ReturnType<typeof startAuthenticatedSyncHttp>> | null,
  paths: [] as string[],
  replayFirst: false,
  firstUrl: '',
  progress: [] as { objectId: string; nextRow: number }[]
}));
vi.mock('./companionRuntimeCapabilities.js', () => ({
  getCompanionRuntimeCapability: () => ({ kind: 'android-native' })
}));
vi.mock('./companionBootstrap.js', () => ({
  loadCompanionBootstrapState: async () => ({ host_name: 'receiver' })
}));
vi.mock('./companion/sync/syncGroupStore.js', () => ({
  loadCompanionSyncGroup: async () => ({ group_id: 'group',
    local_device_identity_key: ids.receiver,
    devices: [{ device_identity_key: ids.receiver, state: 'active' }] })
}));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap.js', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: async (task: (db: DbPort) => unknown) => task(receiver.port!),
    runWriter: async (task: (db: DbPort) => unknown) => task(receiver.port!)
  })
}));
vi.mock('./companion/network/signedRequest.js', () => ({
  createSignedRequestHeaders: async () => ({})
}));
vi.mock('./companion/sync/companionNodeVersionReceiptDelivery.js', () => ({
  flushCompanionNodeVersionReceipts: async () => undefined
}));
vi.mock('./companionDesktopSyncHttp.js', async (original) => ({
  ...await original<typeof import('./companionDesktopSyncHttp.js')>(),
  fetchDesktopJson: async (_endpoint: string, route: string) => receiver.server!.getJson(route)
}));
vi.mock('./companionSyncPackTransfer.js', () => ({
  downloadCompanionDesktopSyncPack: async ({ url }: { url: string }) => {
    receiver.firstUrl ||= url;
    const requestUrl = receiver.replayFirst && receiver.paths.length === 1 ? receiver.firstUrl : url;
    const archive = await receiver.server!.archive(new URL(requestUrl));
    const file = resolveSyncPackPath(`mobile-page-${receiver.paths.length}.db`);
    await extractSyncPackDatabaseFromFile({ archivePath: archive.filePath, outputPath: file,
      expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source,
      maxDatabaseBytes: 4 * 1024 * 1024 });
    await archive.cleanup();
    receiver.paths.push(file);
    return file;
  },
  deleteCompanionDownloadedSyncPack: async (file: string) => fs.rm(file)
}));
vi.mock('./companion/sync/pack-apply/iosCompanionSyncPackApply.js', () => ({
  applyIosCompanionSyncPackPath: async ({ packPath }: { packPath: string }) => {
    const port = receiver.port!;
    await port.run('ATTACH DATABASE ? AS inc', [packPath]);
    try {
      const result = await applySyncPackNodeSurfaceWithDbPort(port, {
        currentCursor: 0, hostName: 'receiver', sourcePeerId: ids.source,
        recordVersionReceipt: true, enqueueSearchInvalidations: false
      });
      if (result.dependencyProgress) receiver.progress.push({
        objectId: result.dependencyProgress.transfer.objectId,
        nextRow: result.dependencyProgress.nextRow
      });
      return { ...result, applied_blob_count: result.appliedBlobCount,
        applied_object_count: result.appliedObjectCount, to_state_seq: result.toStateSeq };
    } finally { await port.run('DETACH DATABASE inc'); }
  }
}));

it.each([false, true])('mobile orchestration scopes dependency progress over real HTTP (replay=%s)', async (replay) => {
  seedMixedSource();
  const target = new Database(resolveSyncPackPath('mobile-orchestration-target.db'));
  target.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  target.exec("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  target.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')")
    .run(ids.receiver);
  receiver.port = createBetterSqliteDbPort(target);
  receiver.paths = [];
  receiver.firstUrl = '';
  receiver.replayFirst = replay;
  receiver.progress = [];
  markDesktopSyncGroupMemberStateReady(ids.receiver);
  receiver.server = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source,
    receiverDeviceId: ids.receiver });
  try {
    const { applyCompanionDesktopSyncPack } = await import('./companionSyncPackApply.js');
    const pending = applyCompanionDesktopSyncPack({ headers: {},
      sourceHostName: 'source', sourcePeerId: ids.source,
      url: receiver.server.origin + '/companion/sync-pack?page_contract=bounded-v1&after_state_seq=0' });
    if (replay) {
      await expect(pending).rejects.toThrow('sync_pack_dependency_no_progress');
      expect(target.prepare('SELECT count(*) AS count FROM sync_pack_dependency_rows').get())
        .toEqual({ count: 1 });
      expect(target.prepare('SELECT count(*) AS count FROM nodes').get()).toEqual({ count: 0 });
      return;
    }
    const result = await pending;
    expect(result.to_state_seq).toBe(6);
    expect(receiver.progress).toEqual([
      { objectId: 'live-1', nextRow: 1 },
      { objectId: 'live-2', nextRow: 1 }
    ]);
    expect(target.prepare('SELECT id, content FROM nodes ORDER BY id').all()).toEqual([
      { id: 'live-1', content: 'body-1' },
      { id: 'live-2', content: 'body-2' }
    ]);
    expect(target.prepare('SELECT count(*) AS count FROM node_sync_tombstones').get())
      .toEqual({ count: 1 });
    expect(target.pragma('quick_check', { simple: true })).toBe('ok');
  } finally {
    await receiver.server.close();
    revokeDesktopSyncGroupMemberStateReadiness(ids.receiver);
    target.close();
  }
});
