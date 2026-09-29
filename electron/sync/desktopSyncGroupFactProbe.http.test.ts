// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { stageSyncPackKnownFactClaims } from '../../lib/core/sync/syncPackKnownFactClaims.js';
import { assertSyncPackManifestMatchesDatabase } from '../../lib/core/sync/syncPackManifestValidation.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { insertNodeSyncState, mockedSyncPackBuilderAppDataDir,
  resolveSyncPackPath, setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { sessionRoot } from './companionLanDependencySession.js';
import { createCompanionFactSession, readCompanionFactSessionPage } from './companionLanFactSession.js';
import { prepareDesktopSyncPackFactRequest } from './desktopSyncGroupFactProbe.js';
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

function seedGroup() {
  const source = openDatabaseConnection().driver;
  source.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  source.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')",
    [ids.source]);
  for (const [id, anchor, library] of [
    [ids.source, '11111111-1111-4111-8111-111111111111', '/source'],
    [ids.receiver, '22222222-2222-4222-8222-222222222222', '/receiver']
  ] as const) source.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
     platform, state, joined_at, updated_at) VALUES ('group', ?, ?, ?, 'Device', 'mac',
     'active', 'now', 'now')`, [id, anchor, library]);
}

function createReceiver() {
  const target = new Database(resolveSyncPackPath('rebased-receiver.db'));
  target.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  target.exec("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  target.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')")
    .run(ids.receiver);
  return target;
}

async function seedLostViewRound() {
  insertNodeSyncState();
  seedGroup();
  const source = openDatabaseConnection();
  source.driver.execute('UPDATE sync_object_state SET sync_dirty = 0');
  const state = source.driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const after = state.high_water;
  const stale = await createCompanionFactSession({ groupId: 'group', toPeerId: 'receiver',
    window: { fromStateSeq: after, toStateSeq: after, frontierStateSeq: after,
      sourceEpoch: state.source_epoch } });
  const viewId = stale.view.sourceViewId;
  stale.view.close();
  const fact = await readCompanionFactSessionPage({ groupId: 'group', peerId: 'receiver', viewId });
  if (!('index' in fact)) throw new Error('expected_fact_page');
  await stageSyncPackKnownFactClaims(createBetterSqliteDbPort(source.sqlite),
    { groupId: 'group', peerId: ids.source, sourceViewId: viewId }, fact.index);
  const sourcePath = path.join(sessionRoot('group', 'receiver'), viewId, 'source.db');
  await fs.rename(sourcePath, `${sourcePath}.lost`);
  source.driver.execute(`UPDATE setting_records SET value_json = '{"theme":"light"}',
    content_hash = 'setting-new' WHERE key = 'app_settings'`);
  source.driver.execute(`UPDATE sync_object_state SET state_seq = ?, content_hash = 'setting-new'
    WHERE object_type = 'setting'`, [after + 1]);
  source.driver.execute('UPDATE sync_state_sequence SET high_water = ? WHERE singleton_id = 1',
    [after + 1]);
  return { after, epoch: state.source_epoch, viewId };
}

async function assertPackAppliesOnce(target: Database.Database, archivePath: string, after: number) {
  const incoming = resolveSyncPackPath('rebased-incoming.db');
  const manifest = await extractSyncPackDatabaseFromFile({ archivePath,
    outputPath: incoming, expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source,
    maxDatabaseBytes: 4 * 1024 * 1024 });
  const port = createBetterSqliteDbPort(target);
  await port.run('ATTACH DATABASE ? AS inc', [incoming]);
  try {
    await assertSyncPackManifestMatchesDatabase(port, manifest);
    const options = { currentCursor: after, hostName: 'receiver', sourcePeerId: ids.source,
      enqueueSearchInvalidations: false };
    const first = await applySyncPackNodeSurfaceWithDbPort(port, options);
    expect(first.applied).toBe(true);
    expect(first.toStateSeq).toBe(after + 1);
    expect(target.prepare("SELECT value_json FROM setting_records WHERE key = 'app_settings'").get())
      .toEqual({ value_json: '{"theme":"light"}' });
    const replay = await applySyncPackNodeSurfaceWithDbPort(port,
      { ...options, currentCursor: after + 1 });
    expect(replay.applied).toBe(false);
    expect(target.prepare("SELECT count(*) AS count FROM setting_records WHERE key = 'app_settings'").get())
      .toEqual({ count: 1 });
  } finally { await port.run('DETACH DATABASE inc'); }
}

it('rechecks a lost view over authenticated HTTP and applies the new frontier once', async () => {
  const { after, epoch, viewId } = await seedLostViewRound();
  const target = createReceiver();
  target.prepare(`INSERT INTO sync_pack_receive_progress
    (group_id, peer_id, source_epoch, cursor_state_seq, frontier_state_seq, completed, updated_at)
    VALUES ('group', ?, ?, ?, ?, 1, 'now')`).run(ids.source, epoch, after, after);
  markDesktopSyncGroupMemberStateReady(ids.receiver);
  const http = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source,
    receiverDeviceId: ids.receiver });
  try {
    await expect(http.getJson(`/companion/sync-pack-facts?page_contract=bounded-v1` +
      `&after_state_seq=${after}&frontier_state_seq=${after}` +
      `&source_epoch=${epoch}&fact_view=${viewId}`))
      .rejects.toThrow('sync_pack_source_view_unavailable');
    const prepared = await prepareDesktopSyncPackFactRequest({ after,
      endpointUrl: http.origin, frontierStateSeq: after, groupId: 'group',
      localDeviceId: ids.receiver, sourcePeerId: ids.source,
      pathWithQuery: `/companion/sync-pack?after_state_seq=${after}&page_contract=bounded-v1` +
        `&frontier_state_seq=${after}&source_epoch=${epoch}`,
      secret: Buffer.alloc(32, 7).toString('base64url'), sourceEpoch: epoch });
    const url = new URL(prepared.pathWithQuery, http.origin);
    expect(prepared.roundRebased).toBe(true);
    expect(url.searchParams.getAll('frontier_state_seq')).toEqual([String(after + 1)]);
    expect(url.searchParams.get('source_epoch')).toBe(epoch);
    expect(url.searchParams.has('fact_view')).toBe(false);
    const resource = await http.archive(url);
    try { await assertPackAppliesOnce(target, resource.filePath, after); }
    finally { await resource.cleanup(); }
  } finally {
    await http.close();
    revokeDesktopSyncGroupMemberStateReadiness(ids.receiver);
    target.close();
  }
});
