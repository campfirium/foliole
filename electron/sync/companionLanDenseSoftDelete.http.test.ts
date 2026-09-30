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

function seedSource(trimmed: boolean) {
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
  for (let seq = 1; seq <= 32; seq++) {
    const id = `deleted-${seq}`;
    driver.execute(`INSERT INTO nodes
      (id, kind, title, current_version_id, deleted_at, created_at, updated_at)
      VALUES (?, 'topic', ?, ?, 'now', 'now', 'now')`, [id, id, `${id}-20`]);
    for (let version = 1; version <= 20; version++) {
      const versionId = `${id}-${version}`;
      const parent = version === 1 ? null : `${id}-${version - 1}`;
      const body = trimmed && version < 20 ? null : `body-${versionId}`;
      driver.execute(`INSERT INTO node_sync_versions
        (version_id, object_id, parent_version_id, host_name, created_at,
          content_hash, body_text, snapshot_json)
        VALUES (?, ?, ?, 'source', 'now', ?, ?, ?)`,
      [versionId, id, parent, `hash-${versionId}`, body,
        JSON.stringify({ id, title: id, content: body, deleted_at: 'now' })]);
      if (parent) driver.execute('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)',
        [versionId, parent]);
    }
    driver.execute(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, updated_at,
        deleted_at, sync_dirty, last_modified_by_host_name)
      VALUES ('node', ?, ?, 'deleted', 'now', 'now', 0, 'source')`, [id, seq]);
  }
  driver.execute('UPDATE sync_state_sequence SET high_water = 32 WHERE singleton_id = 1');
}

type Server = Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>;

async function claimFacts(server: Server) {
  const route = '/companion/sync-pack-facts?page_contract=bounded-v1&after_state_seq=0';
  let page = await server.getJson(route) as unknown as
    { source_view_id: string; index?: SyncPackFactIndex; ready?: boolean };
  const viewId = page.source_view_id;
  let pages = 0;
  while (page.index && pages < 30) {
    pages++;
    expect(page.index.to_state_seq).toBe(32);
    const bits = encodeSyncPackFactClaims(page.index,
      { versions: [], parents: [], reviews: [] });
    const next = new URL(route, server.origin);
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
  return { viewId, pages };
}

async function applyPacks(server: Server, viewId: string, trimmed: boolean) {
  const target = new Database(resolveSyncPackPath('dense-soft-delete-target.db'));
  try {
    target.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    target.exec("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
    target.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')")
      .run(ids.receiver);
    const port = createBetterSqliteDbPort(target);
    let url = new URL(`/companion/sync-pack?page_contract=bounded-v1` +
      `&after_state_seq=0&fact_view=${viewId}`, server.origin);
    let packs = 0;
    while (packs < 100) {
      const archive = await server.archive(url);
      try {
        const incoming = resolveSyncPackPath(`dense-soft-delete-${packs}.db`);
        await extractSyncPackDatabaseFromFile({ archivePath: archive.filePath,
          outputPath: incoming, expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source,
          maxDatabaseBytes: 4 * 1024 * 1024 });
        await port.run('ATTACH DATABASE ? AS inc', [incoming]);
        try {
          const result = await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0,
            hostName: 'receiver', sourcePeerId: ids.source, recordVersionReceipt: true,
            enqueueSearchInvalidations: false });
          packs++;
          if (!result.dependencyProgress) {
            expect(result.toStateSeq).toBe(32);
            expect(target.prepare('SELECT count(*) AS count FROM nodes WHERE deleted_at IS NOT NULL').get())
              .toEqual({ count: 32 });
            expect(target.prepare('SELECT count(*) AS count FROM node_sync_versions').get())
              .toEqual({ count: 640 });
            expect(target.prepare(`SELECT count(*) AS count FROM node_sync_versions
              WHERE body_text IS NULL AND json_type(snapshot_json, '$.content') = 'null'`).get())
              .toEqual({ count: trimmed ? 608 : 0 });
            expect(target.prepare('SELECT count(*) AS count FROM node_sync_version_parents').get())
              .toEqual({ count: 608 });
            expect(target.pragma('quick_check', { simple: true })).toBe('ok');
            return packs;
          }
          expect(result.toStateSeq).toBe(0);
          url = new URL(dependencyResumeUrl(url.href, result.dependencyProgress));
        } finally { await port.run('DETACH DATABASE inc'); }
      } finally { await archive.cleanup(); }
    }
    throw new Error('dense_soft_delete_pack_limit');
  } finally { target.close(); }
}

it.each([false, true])('transfers 32 soft-deleted histories across authenticated bounded pages (trimmed=%s)', async (trimmed) => {
  seedSource(trimmed);
  markDesktopSyncGroupMemberStateReady(ids.receiver);
  const server = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source,
    receiverDeviceId: ids.receiver });
  try {
    const started = performance.now();
    const { viewId, pages } = await claimFacts(server);
    const packs = await applyPacks(server, viewId, trimmed);
    expect(pages).toBeGreaterThan(1);
    expect(packs).toBeGreaterThanOrEqual(33);
    if (process.env.T267_PROFILE_DENSE_SOFT_DELETE) {
      process.stdout.write(JSON.stringify({ pages, packs,
        elapsedMs: Math.round(performance.now() - started) }) + '\n');
    }
  } finally { await server.close(); revokeDesktopSyncGroupMemberStateReadiness(ids.receiver); }
}, 120_000);
