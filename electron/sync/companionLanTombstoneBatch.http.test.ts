// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { encodeSyncPackFactClaims, type SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { mockedSyncPackBuilderAppDataDir, readPackRows, resolveSyncPackPath,
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
  for (let seq = 1; seq <= 32; seq++) {
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
  driver.execute('UPDATE sync_state_sequence SET high_water = 32 WHERE singleton_id = 1');
}

async function assertApplied(archivePath: string) {
  const incoming = resolveSyncPackPath('tombstone-batch.db');
  await extractSyncPackDatabaseFromFile({ archivePath,
    outputPath: incoming, expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source,
    maxDatabaseBytes: 4 * 1024 * 1024 });
  const target = new Database(resolveSyncPackPath('tombstone-target.db'));
  try {
    target.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    target.exec("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
    target.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')")
      .run(ids.receiver);
    const port = createBetterSqliteDbPort(target);
    await port.run('ATTACH DATABASE ? AS inc', [incoming]);
    try {
      const options = { hostName: 'receiver', sourcePeerId: ids.source,
        recordVersionReceipt: true, enqueueSearchInvalidations: false };
      const applied = await applySyncPackNodeSurfaceWithDbPort(port, { ...options, currentCursor: 0 });
      expect(applied.toStateSeq).toBe(32);
      expect(applied.appliedTombstoneNodeIds).toEqual(Array.from({ length: 32 },
        (_, index) => `deleted-${index + 1}`).sort());
      const sequence = target.prepare('SELECT high_water FROM sync_state_sequence WHERE singleton_id = 1')
        .pluck().get();
      const replay = await applySyncPackNodeSurfaceWithDbPort(port, { ...options, currentCursor: 32 });
      expect(replay.applied).toBe(false);
      expect(target.prepare('SELECT high_water FROM sync_state_sequence WHERE singleton_id = 1')
        .pluck().get()).toBe(sequence);
    } finally { await port.run('DETACH DATABASE inc'); }
  } finally { target.close(); }
}

it('sends consecutive removed-node tombstones in one authenticated bounded pack', async () => {
  seedSource();
  markDesktopSyncGroupMemberStateReady(ids.receiver);
  const server = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source,
    receiverDeviceId: ids.receiver });
  try {
    const factPath = '/companion/sync-pack-facts?page_contract=bounded-v1&after_state_seq=0';
    const index = await server.getJson(factPath) as unknown as SyncPackFactIndex;
    expect(index.to_state_seq).toBe(32);
    const bits = encodeSyncPackFactClaims(index, { versions: [], parents: [], reviews: [] });
    const url = new URL('/companion/sync-pack?page_contract=bounded-v1&after_state_seq=0', server.origin);
    url.searchParams.set('fact_index_id', index.index_id);
    url.searchParams.set('frontier_state_seq', String(index.frontier_state_seq));
    url.searchParams.set('source_epoch', index.source_epoch);
    for (const [key, value] of [['have_v', bits.versions], ['have_p', bits.parents],
      ['have_r', bits.reviews]] as const) url.searchParams.set(key, value);
    const archive = await server.archive(url);
    try {
      const rows = readPackRows(archive.filePath);
      expect(rows.manifest.to_state_seq).toBe(32);
      expect(rows.nodeTombstones).toHaveLength(32);
      expect((rows.stateRows as Array<{ object_id: string }>).map((row) => row.object_id))
        .toEqual(Array.from({ length: 32 }, (_, index) => `deleted-${index + 1}`));
      await assertApplied(archive.filePath);
    } finally { await archive.cleanup(); }
  } finally { await server.close(); revokeDesktopSyncGroupMemberStateReadiness(ids.receiver); }
});
