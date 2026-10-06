// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { dependencyResumeUrl } from '../../lib/core/sync/syncPackDependencyResume.js';
import { encodeSyncPackFactClaims } from '../../lib/core/sync/syncPackFactPresence.js';
import { stageSyncPackKnownFactClaims } from '../../lib/core/sync/syncPackKnownFactClaims.js';
import { assertSyncPackManifestMatchesDatabase } from '../../lib/core/sync/syncPackManifestValidation.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { insertNodeSyncState, mockedSyncPackBuilderAppDataDir,
  resolveSyncPackPath, setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';
import { selectDesktopSyncPackFactWindow } from '../database/syncPackFactWindow.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { createCompanionFactSession, readCompanionFactSessionPage } from './companionLanFactSession.js';
import { restoreKnownFactReceiptHolds } from './companionLanKnownFactPack.js';
import { seedPagedFactReceiver } from './companionLanPagedFactRoundTrip.testSupport.js';
import { buildCompanionSyncPackResource } from './companionLanSyncPack.js';
import { extractSyncPackDatabaseFromFile } from './syncPackContainerReader.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: 'source',
  devices: [{ device_identity_key: 'source', state: 'active' },
    { device_identity_key: 'receiver', state: 'active' }]
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({ ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
setupSyncPackBuilderTestLifecycle();

function seedSource(count = 129) {
  insertNodeSyncState();
  const source = openDatabaseConnection().driver;
  for (let i = 1; i <= count; i++) {
    const id = `v${String(i).padStart(4, '0')}`;
    const parent = i === 1 ? 'desktop#node-1-v1' : `v${String(i - 1).padStart(4, '0')}`;
    source.execute(`INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, 'node-1', ?, 'desktop', 'now', ?, 'body', '{"id":"node-1","content":null}')`,
    [id, parent, `hash-${id}`]);
    source.execute('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)', [id, parent]);
  }
  source.execute('UPDATE nodes SET current_version_id = ? WHERE id = ?',
    [`v${String(count).padStart(4, '0')}`, 'node-1']);
  source.execute(`INSERT OR IGNORE INTO nodes (id, kind, title, created_at, updated_at)
    VALUES ('special-inbox', 'folder', 'Inbox', 'now', 'now')`);
  source.execute("UPDATE nodes SET parent_id = 'special-inbox' WHERE id = 'node-1'");
  source.execute('UPDATE sync_object_state SET sync_dirty = 0');
}

async function applyPack(url: URL, target: Database.Database, name: string,
  requestPack?: (url: URL) => Promise<{ status: 'ready'; filePath: string; cleanup: () => Promise<void> }>) {
  const resource = requestPack ? await requestPack(url) : await buildCompanionSyncPackResource(url, 'receiver');
  const port = createBetterSqliteDbPort(target);
  try {
    const incoming = resolveSyncPackPath(name);
    const manifest = await extractSyncPackDatabaseFromFile({ archivePath: resource.filePath!,
      outputPath: incoming, expectedPeerId: 'receiver', expectedSourcePeerId: 'source',
      maxDatabaseBytes: 4 * 1024 * 1024 });
    await port.run('ATTACH DATABASE ? AS inc', [incoming]);
    try {
      await assertSyncPackManifestMatchesDatabase(port, manifest);
      const result = await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0,
        hostName: 'receiver', sourcePeerId: 'source', recordVersionReceipt: true,
        enqueueSearchInvalidations: false });
      return { result, manifest };
    } finally { await port.run('DETACH DATABASE inc'); }
  } finally { await resource.cleanup?.(); }
}

async function claimHistory(target: Database.Database, fromStateSeq = 0,
  http?: Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>) {
  const source = openDatabaseConnection();
  const state = source.driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const window = selectDesktopSyncPackFactWindow(source.driver, { fromStateSeq,
    frontierStateSeq: state.high_water, sourceEpoch: state.source_epoch });
  const fact = http ? null : await createCompanionFactSession({ groupId: 'group', toPeerId: 'receiver',
    window });
  const firstPath = `/companion/sync-pack-facts?page_contract=bounded-v1&after_state_seq=${fromStateSeq}`;
  const first = http ? await http.getJson(firstPath) as unknown as Awaited<ReturnType<typeof readCompanionFactSessionPage>>
    : await readCompanionFactSessionPage({ groupId: 'group', peerId: 'receiver',
      viewId: fact!.view.sourceViewId });
  const viewId = first.source_view_id;
  fact?.view.close();
  const port = createBetterSqliteDbPort(target);
  let page = first;
  const seenPages = new Set<string>();
  while ('index' in page) {
    expect(seenPages.has(page.index.index_id)).toBe(false);
    seenPages.add(page.index.index_id);
    const claims = await stageSyncPackKnownFactClaims(port,
      { groupId: 'group', peerId: 'source', sourceViewId: viewId }, page.index);
    const bits = encodeSyncPackFactClaims(page.index, claims);
    if (http) {
      const next = new URL(firstPath, http.origin);
      next.searchParams.set('fact_view', viewId);
      next.searchParams.set('frontier_state_seq', String(state.high_water));
      next.searchParams.set('source_epoch', state.source_epoch);
      next.searchParams.set('fact_index_id', page.index.index_id);
      next.searchParams.set('have_v', bits.versions);
      next.searchParams.set('have_p', bits.parents);
      next.searchParams.set('have_r', bits.reviews);
      page = await http.getJson(next.pathname + next.search) as unknown as typeof page;
    } else page = await readCompanionFactSessionPage({ groupId: 'group', peerId: 'receiver',
      viewId, previousIndexId: page.index.index_id, claimBits: bits });
  }
  expect('ready' in page && page.ready).toBe(true);
  return { viewId, url: new URL(
    `/companion/sync-pack?page_contract=bounded-v1&after_state_seq=${fromStateSeq}&fact_view=${viewId}`,
    http?.origin ?? 'http://localhost') };
}

it('packs an open-state change after more than 4096 known facts', async () => {
  seedSource(2050);
  const source = openDatabaseConnection().driver;
  source.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  source.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', 'source', 'active', 'now')");
  for (const peerId of ['source', 'receiver']) source.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
     platform, state, joined_at, updated_at) VALUES ('group', ?, ?, '/source', ?, 'mac', 'active', 'now', 'now')`,
  [peerId, peerId, peerId]);
  source.execute("INSERT INTO node_open_state (node_id, last_opened_at) VALUES ('node-1', 'now')");
  source.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node_open_state', 'node-1', 3, 'open-hash', 'desktop', 'now', 0)`);
  const target = seedPagedFactReceiver();
  try {
    const { url } = await claimHistory(target, 2);
    const resource = await buildCompanionSyncPackResource(url, 'receiver');
    try {
      const incoming = resolveSyncPackPath('open-state-incoming.db');
      const manifest = await extractSyncPackDatabaseFromFile({ archivePath: resource.filePath!,
        outputPath: incoming, expectedPeerId: 'receiver', expectedSourcePeerId: 'source',
        maxDatabaseBytes: 4 * 1024 * 1024 });
      expect(manifest.toStateSeq).toBe(3);
      expect(manifest.dependencyTransfers).toBeUndefined();
      const pack = new Database(incoming, { readonly: true });
      try {
        expect(pack.prepare('SELECT count(*) AS count FROM node_sync_versions').get())
          .toEqual({ count: 0 });
        expect(pack.prepare("SELECT object_type FROM sync_object_state WHERE object_type = 'node_open_state'")
          .get()).toEqual({ object_type: 'node_open_state' });
      } finally { pack.close(); }
      expect(source.queryOne('SELECT 1 AS held FROM node_version_outbound_holds WHERE pack_id = ?',
        [manifest.packId])).toEqual({ held: 1 });
      source.execute('DELETE FROM node_version_outbound_holds WHERE pack_id = ?', [manifest.packId]);
      await restoreKnownFactReceiptHolds({ groupId: 'group', peerId: 'receiver',
        packId: manifest.packId, fromPeerId: 'source',
        results: [{ objectId: 'node-1', sentVersionId: 'v2050' }] });
      expect(source.queryOne('SELECT 1 AS held FROM node_version_outbound_holds WHERE pack_id = ?',
        [manifest.packId])).toEqual({ held: 1 });
    } finally { await resource.cleanup?.(); }
    const retry = await buildCompanionSyncPackResource(url, 'receiver');
    expect(retry.status).toBe('ready');
    await retry.cleanup?.();
  } finally { target.close(); }
});

it('applies only two missing versions and parent edges after the receiver claimed 128 known versions', async () => {
  seedSource();
  const target = seedPagedFactReceiver(true);
  try {
    const { url } = await claimHistory(target);
    let request = url;
    const seenRequests = new Set<string>();
    for (;;) {
      expect(seenRequests.has(request.href)).toBe(false);
      seenRequests.add(request.href);
      const { result, manifest } = await applyPack(request, target, `missing-${seenRequests.size}.db`);
      if (!result.dependencyProgress) {
        expect(manifest.dependencyTransfers?.[0]?.expectedRows).toBe(4);
        expect(result.toStateSeq).toBe(2);
        break;
      }
      expect(result.toStateSeq).toBe(0);
      request = new URL(dependencyResumeUrl(request.toString(), result.dependencyProgress));
    }
    expect(target.prepare('SELECT count(*) AS count FROM node_sync_versions').get()).toEqual({ count: 130 });
    expect(target.prepare('SELECT count(*) AS count FROM node_sync_version_parents').get())
      .toEqual({ count: 129 });
    expect(target.prepare('SELECT count(*) AS count FROM sync_pack_known_fact_claims').get())
      .toEqual({ count: 0 });
  } finally { target.close(); }
});

it('rejects an existing parent chain that differs from the source view', async () => {
  seedSource();
  const target = seedPagedFactReceiver();
  try {
    target.exec(`INSERT INTO nodes (id, kind, title, created_at, updated_at)
      VALUES ('other-parent', 'folder', 'Other', 'now', 'now');
      UPDATE nodes SET parent_id = 'other-parent' WHERE id = 'special-inbox';`);
    const { url } = await claimHistory(target);
    await expect(applyPack(url, target, 'divergent-parent-incoming.db'))
      .rejects.toThrow('sync_pack_dependency_apply_ancestry_mismatch');
  } finally { target.close(); }
});
