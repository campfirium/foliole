// @vitest-environment node

import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { receiveSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { dependencyResumeUrl } from '../../lib/core/sync/syncPackDependencyResume.js';
import { encodeSyncPackFactClaims, type SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { mockedSyncPackBuilderAppDataDir, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';
import { applyPage, nodeIds } from '../database/workgroupRestoreIntegration.fixture.js';

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

for (const receiver of ['desktop', 'companion'] as const) {
  it(`${receiver} adopts a restore through authenticated fact negotiation and the real LAN provider`, async () => {
    const event = seedRestoredSource();
    const target = new Database(':memory:');
    for (const sql of COMPANION_SCHEMA_STATEMENTS) target.exec(sql);
    target.prepare("INSERT INTO sync_groups VALUES ('group', 'Group', 'secret', 'now', 'now')").run();
    target.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')").run(ids.receiver);
    seedDevices(target);
    target.exec("INSERT INTO nodes (id, kind, title, content, created_at, updated_at) VALUES ('old', 'topic', 'Old', '', 'now', 'now')");
    const port = createBetterSqliteDbPort(target);
    await receiveSyncGroupRestoreEvent(port, event);
    markDesktopSyncGroupMemberStateReady(ids.receiver, 'restore');
    const server = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source, receiverDeviceId: ids.receiver });
    try {
      const initial = new URL('/companion/sync-pack?after_state_seq=0&page_contract=bounded-v1&restore_id=restore-http', server.origin);
      const factUrl = new URL(initial);
      factUrl.pathname += '-facts';
      await expect(server.getJson(factUrl.pathname + factUrl.search.replace('restore-http', 'wrong-restore')))
        .rejects.toThrow('sync_group_restore_source_unavailable');
      await negotiateFacts(server, initial, factUrl);
      await receiveRestorePages(server, initial, receiver, target, event.restore_id);
      expect(nodeIds(target)).toEqual(['chosen-backup']);
      expect(target.prepare('SELECT applied_at FROM sync_group_restore_events').get())
        .toEqual({ applied_at: expect.any(String) });
      await expect(server.getJson('/companion/sync-pack-facts?after_state_seq=0&page_contract=bounded-v1'))
        .rejects.toThrow('sync_group_member_state_required');
    } finally { await server.close(); target.close(); revokeDesktopSyncGroupMemberStateReadiness(ids.receiver); }
  });
}

type RestoreServer = Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>;
type RestoreFactIndex = SyncPackFactIndex & { round_source_view_id?: string };

function seedDevices(database: Database.Database) {
  for (const identity of [ids.source, ids.receiver]) {
    const [, , anchor, libraryPath] = JSON.parse(identity) as string[];
    database.prepare(`INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, updated_at)
      VALUES ('group', ?, ?, ?, 'Device', 'mac', 'active', 'now', 'now')`)
      .run(identity, anchor, libraryPath);
  }
}

async function negotiateFacts(server: RestoreServer, packUrl: URL, factUrl: URL) {
  for (let page = 0; page < 30; page++) {
    const response = await server.getJson(factUrl.pathname + factUrl.search) as unknown as
      RestoreFactIndex & { source_view_id?: string; index?: RestoreFactIndex; ready?: boolean };
    if (response.ready) { packUrl.searchParams.set('fact_view', response.source_view_id!); return; }
    const index = response.index ?? response;
    const bits = encodeSyncPackFactClaims(index, { versions: [], parents: [], reviews: [] });
    const parameters = { fact_index_id: index.index_id,
      frontier_state_seq: index.frontier_state_seq, source_epoch: index.source_epoch,
      to_state_seq: index.to_state_seq, have_v: bits.versions, have_p: bits.parents, have_r: bits.reviews,
      ...(response.source_view_id ? { fact_view: response.source_view_id } : {}),
      ...(index.round_source_view_id ? { round_source_view_id: index.round_source_view_id } : {}) };
    for (const [key, value] of Object.entries(parameters)) factUrl.searchParams.set(key, String(value));
    if (!response.source_view_id) { packUrl.search = factUrl.search; return; }
  }
  throw new Error('restore_fact_page_limit');
}

async function receiveRestorePages(server: RestoreServer, initial: URL,
  receiver: 'desktop' | 'companion', target: Database.Database, restoreId: string) {
  let url = initial;
  for (let page = 0; page < 30; page++) {
    const archive = await server.archive(url);
    const incomingPath = resolveSyncPackPath(`restore-http-${receiver}-${page}.db`);
    try {
      const manifest = await extractSyncPackDatabaseFromFile({ archivePath: archive.filePath,
        expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source, outputPath: incomingPath });
      const outcome = await applyPage(receiver, target, 0, { path: incomingPath,
        frontier: manifest.frontierStateSeq }, restoreId, ids.source);
      const result = 'result' in outcome ? outcome.result : outcome;
      if (!result.dependencyProgress) return;
      expect(nodeIds(target)).toEqual(['old']);
      url = new URL(dependencyResumeUrl(url.href, result.dependencyProgress));
    } finally { await archive.cleanup(); }
  }
  throw new Error('restore_pack_page_limit');
}

function seedRestoredSource() {
  const driver = openDatabaseConnection().driver;
  driver.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'secret', 'now', 'now')");
  driver.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')", [ids.source]);
  seedDevices(openDatabaseConnection().sqlite);
  upsertNodeSnapshot({ nodeId: 'chosen-backup', kind: 'topic', title: 'Chosen backup', content: '# Backup',
    parentNodeId: null, position: 0, isTitleManual: true, anchorLink: null, reveal: null,
    createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z' });
  const event = { group_id: 'group', restore_id: 'restore-http', restored_at: '2026-09-30T00:00:00.000Z',
    source_device_identity_key: ids.source };
  driver.execute(`INSERT INTO sync_group_restore_events VALUES (?, ?, ?, ?, 'now', 'now')`,
    [event.restore_id, event.group_id, event.restored_at, event.source_device_identity_key]);
  driver.execute("UPDATE sync_state_sequence SET source_epoch = 'restore-http'");
  return event;
}
