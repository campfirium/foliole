// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { dependencyResumeUrl } from '../../lib/core/sync/syncPackDependencyResume.js';
import { encodeSyncPackFactClaims, type SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
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

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: ids.source,
  devices: [{ device_identity_key: ids.source, state: 'active' },
    { device_identity_key: ids.receiver, state: 'active' }]
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
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

type TestServer = Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>;

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

async function negotiateFactView(server: TestServer) {
    const firstPath = '/companion/sync-pack-facts?page_contract=bounded-v1&after_state_seq=0';
    let page = await server.getJson(firstPath) as unknown as
      { source_view_id: string; index?: SyncPackFactIndex; ready?: boolean };
    const viewId = page.source_view_id;
    expect(page.index?.to_state_seq).toBe(6);
    for (let turn = 0; page.index && turn < 8; turn++) {
      const bits = encodeSyncPackFactClaims(page.index,
        { versions: [], parents: [], reviews: [] });
      const next = new URL(firstPath, server.origin);
      next.searchParams.set('fact_view', viewId);
      next.searchParams.set('frontier_state_seq', String(page.index.frontier_state_seq));
      next.searchParams.set('source_epoch', page.index.source_epoch);
      next.searchParams.set('fact_index_id', page.index.index_id);
      next.searchParams.set('have_v', bits.versions);
      next.searchParams.set('have_p', bits.parents);
      next.searchParams.set('have_r', bits.reviews);
      page = await server.getJson(next.pathname + next.search) as typeof page;
    }
    expect(page.ready).toBe(true);
  return viewId;
}

function assertReceivedNodes(target: Database.Database, softDeleted: boolean, staged: string[]) {
  expect(target.prepare('SELECT count(*) AS count FROM node_sync_versions').get())
    .toEqual({ count: 2 });
  expect(target.prepare('SELECT node_id FROM node_sync_tombstones').get())
    .toEqual({ node_id: 'deleted-3' });
  expect(target.prepare('SELECT id FROM attachments').get())
    .toEqual({ id: 'a'.repeat(64) });
  if (softDeleted) expect(target.prepare("SELECT deleted_at FROM nodes WHERE id = 'live-2'").get())
    .toEqual({ deleted_at: 'now' });
  expect(target.prepare('SELECT id, content FROM nodes ORDER BY id').all())
    .toEqual([{ id: 'live-1', content: 'body-1' }, { id: 'live-2', content: 'body-2' }]);
  expect(staged).toEqual(['live-1', 'live-2']);
}

async function applyPages(server: TestServer, viewId: string, softDeleted = false) {
  const targetPath = resolveSyncPackPath('multi-node-http-target.db');
  let target = new Database(targetPath);
  try {
    target.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    target.exec("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
    target.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')")
      .run(ids.receiver);
    let url = new URL(`/companion/sync-pack?page_contract=bounded-v1` +
      `&after_state_seq=0&fact_view=${viewId}`, server.origin);
    const staged: string[] = [];
    for (let turn = 0; turn < 8; turn++) {
      const archive = await server.archive(url);
      try {
        const incoming = resolveSyncPackPath(`multi-node-http-${turn}.db`);
        await extractSyncPackDatabaseFromFile({ archivePath: archive.filePath,
          outputPath: incoming, expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source,
          maxDatabaseBytes: 4 * 1024 * 1024 });
        const port = createBetterSqliteDbPort(target);
        let reopen = false;
        await port.run('ATTACH DATABASE ? AS inc', [incoming]);
        try {
          const result = await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0,
            hostName: 'receiver', sourcePeerId: ids.source, recordVersionReceipt: true,
            enqueueSearchInvalidations: false });
          if (!result.dependencyProgress) {
            expect(result.toStateSeq).toBe(6);
            assertReceivedNodes(target, softDeleted, staged);
            break;
          }
          staged.push(result.dependencyProgress.transfer.objectId);
          expect(result.toStateSeq).toBe(0);
          if (turn === 0) {
            const replay = await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0,
              hostName: 'receiver', sourcePeerId: ids.source, recordVersionReceipt: true,
              enqueueSearchInvalidations: false });
            expect(replay.dependencyProgress).toMatchObject({
              transfer: result.dependencyProgress.transfer,
              nextRow: result.dependencyProgress.nextRow, replay: true
            });
            expect(target.prepare('SELECT count(*) AS count FROM sync_pack_dependency_rows').get())
              .toEqual({ count: 1 });
          }
          url = new URL(dependencyResumeUrl(url.href, result.dependencyProgress));
          reopen = turn === 0;
        } finally { await port.run('DETACH DATABASE inc'); }
        if (reopen) { target.close(); target = new Database(targetPath); }
      } finally { await archive.cleanup(); }
    }
  } finally { target.close(); }
}

it('transfers live nodes and a bare tombstone through authenticated dependency pages', async () => {
  seedMixedSource();
  markDesktopSyncGroupMemberStateReady(ids.receiver);
  const server = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source,
    receiverDeviceId: ids.receiver });
  try { await applyPages(server, await negotiateFactView(server)); }
  finally { await server.close(); revokeDesktopSyncGroupMemberStateReadiness(ids.receiver); }
});

it('transfers a removed node with retained version history in the same window', async () => {
  seedMixedSource(true);
  markDesktopSyncGroupMemberStateReady(ids.receiver);
  const server = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source,
    receiverDeviceId: ids.receiver });
  try { await applyPages(server, await negotiateFactView(server), true); }
  finally { await server.close(); revokeDesktopSyncGroupMemberStateReadiness(ids.receiver); }
});
