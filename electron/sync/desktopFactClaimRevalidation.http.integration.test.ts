// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks';
import { promises as fs } from 'node:fs';

import { expect, it, vi } from 'vitest';

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { openDatabaseConnection, type DatabaseConnection } from '../database/connection.js';
import { mockedSyncPackBuilderAppDataDir, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { seedMixedSource } from './companionLanMultiNodeBatch.testSupport.js';
import { openContinuationReceiver } from './desktopResourceArticleContinuation.testSupport.js';
import { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupHttp.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { downloadAndApplyDesktopSyncGroupPack } from './desktopSyncGroupPackApply.js';
import { readThreePeerIncomingFacts } from './desktopSyncGroupThreePeerHistory.testSupport.js';

const fixture = vi.hoisted(() => ({
  routing: null as AsyncLocalStorage<DatabaseConnection> | null,
  collect: false, sentVersionIds: [] as string[],
  ids: {
    source: JSON.stringify([1, 'group', '11111111-1111-4111-8111-111111111111', '/source']),
    receiver: JSON.stringify([1, 'group', '22222222-2222-4222-8222-222222222222', '/receiver'])
  }
}));
// Observe authenticated decoded rows before apply; delegate the actual cursor and all business logic.
vi.mock('../../lib/core/sync/syncPackCursor.js', async (original) => {
  const actual = await original<typeof import('../../lib/core/sync/syncPackCursor.js')>();
  return { ...actual, readSyncPackCursorWithDbPort: async (...args: Parameters<typeof actual.readSyncPackCursorWithDbPort>) => {
    const cursor = await actual.readSyncPackCursorWithDbPort(...args);
    const receiver = fixture.routing?.getStore();
    if (fixture.collect && receiver) fixture.sentVersionIds.push(...readThreePeerIncomingFacts(
      receiver.sqlite, Boolean(cursor.dependencyPage)).versionIds);
    return cursor;
  } };
});
vi.mock('../database/connection.js', async (original) => {
  const actual = await original<typeof import('../database/connection.js')>();
  return { ...actual,
    openDatabaseConnection: () => fixture.routing?.getStore() ?? actual.openDatabaseConnection(),
    runWithDatabaseConnectionOwner<T>(task: () => T | Promise<T>) {
      return fixture.routing?.getStore() ? Promise.resolve().then(task) : actual.runWithDatabaseConnectionOwner(task);
    }
  };
});
vi.mock('../database/hostProfile.js', () => ({ loadOrCreateDesktopHostName: () =>
  fixture.routing?.getStore() ? 'receiver' : 'source' }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: mockedSyncPackBuilderAppDataDir + '/cache',
  app_config_dir: mockedSyncPackBuilderAppDataDir + '/config',
  app_log_dir: mockedSyncPackBuilderAppDataDir + '/logs'
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: fixture.routing?.getStore() ? fixture.ids.receiver : fixture.ids.source,
  devices: [{ device_identity_key: fixture.ids.source, state: 'active' },
    { device_identity_key: fixture.ids.receiver, state: 'active' }]
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
fixture.routing = new AsyncLocalStorage<DatabaseConnection>();
setupSyncPackBuilderTestLifecycle();

function prepareReceiver(nodeCount: number) {
  seedMixedSource(fixture.ids);
  const source = openDatabaseConnection();
  source.sqlite.prepare('DELETE FROM sync_object_state WHERE state_seq > ?').run(nodeCount);
  source.sqlite.exec('DELETE FROM node_sync_tombstones');
  source.sqlite.exec(`UPDATE nodes SET content=(SELECT body_text FROM node_sync_versions
    WHERE version_id=nodes.current_version_id), sync_dirty=0`);
  if (nodeCount === 1) {
    source.sqlite.exec("DELETE FROM nodes WHERE id='live-2'; DELETE FROM node_sync_versions WHERE object_id='live-2'");
  }
  source.sqlite.prepare('UPDATE sync_state_sequence SET high_water=? WHERE singleton_id=1').run(nodeCount);
  const receiver = openContinuationReceiver(resolveSyncPackPath('claim-receiver.db'));
  initializeDatabaseConnection({ sqlite: receiver.sqlite });
  receiver.sqlite.prepare('ATTACH DATABASE ? AS src').run(source.dbPath);
  try {
    for (const table of ['sync_groups', 'sync_group_devices', 'nodes', 'node_sync_versions']) {
      receiver.sqlite.exec(`INSERT INTO ${table} SELECT * FROM src.${table}`);
    }
  } finally { receiver.sqlite.exec('DETACH DATABASE src'); }
  receiver.sqlite.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')")
    .run(fixture.ids.receiver);
  receiver.sqlite.prepare(`INSERT INTO sync_pack_known_fact_claims
    (group_id, peer_id, source_view_id, kind, fact_key, fact_json)
    VALUES ('group', ?, 'other-view', 'progress', 'round', '{"from_state_seq":0}')`).run(fixture.ids.receiver);
  return receiver;
}

it.each([1, 2])('rejects a reclaimed claimed body and retries the real HTTP receive path (nodes=%s)', async (nodeCount) => {
  fixture.collect = false;
  fixture.sentVersionIds = [];
  const receiver = prepareReceiver(nodeCount);
  markDesktopSyncGroupMemberStateReady(fixture.ids.receiver);
  const http = await startAuthenticatedSyncHttp({ sourceDeviceId: fixture.ids.source,
    receiverDeviceId: fixture.ids.receiver });
  const peer = { endpoint_url: http.origin, group_id: 'group', local_device_id: fixture.ids.receiver,
    peer_device_id: fixture.ids.source, peer_device_name: 'Source' };
  const receive = () => fixture.routing!.run(receiver, () => downloadAndApplyDesktopSyncGroupPack({
    after: 0, peer, createHeaders: createDesktopSyncGroupSignedHeaders }));
  const beforeNodes = receiver.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all();
  const beforeSequence = receiver.sqlite.prepare('SELECT * FROM sync_state_sequence').all();
  const actualFetch = globalThis.fetch.bind(globalThis);
  let inject = true;
  const requests: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    requests.push(url);
    if (inject && new URL(url).pathname === '/companion/sync-pack') {
      inject = false;
      receiver.sqlite.exec(`UPDATE node_sync_versions SET body_text=NULL,
        snapshot_json=json_set(snapshot_json, '$.content', NULL) WHERE version_id='version-1'`);
    }
    return actualFetch(input, init);
  });
  try {
    await expect(receive()).rejects.toThrow('sync_pack_fact_presence_changed');
    expect(inject).toBe(false);
    expect(receiver.sqlite.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(beforeNodes);
    expect(receiver.sqlite.prepare('SELECT cursor_state_seq FROM sync_pack_receive_progress').all()).toEqual([]);
    expect(receiver.sqlite.prepare('SELECT * FROM sync_state_sequence').all()).toEqual(beforeSequence);
    expect(receiver.sqlite.prepare(`SELECT peer_id, source_view_id FROM sync_pack_known_fact_claims`).all())
      .toEqual([{ peer_id: fixture.ids.receiver, source_view_id: 'other-view' }]);
    fixture.collect = true;
    const retry = await receive();
    expect(fixture.sentVersionIds).toEqual(['version-1']);
    expect(retry.cursor).toBe(nodeCount);
    expect(receiver.sqlite.prepare('SELECT id, content FROM nodes ORDER BY id').all())
      .toEqual(Array.from({ length: nodeCount }, (_, i) => ({ id: `live-${i + 1}`, content: `body-${i + 1}` })));
    expect(receiver.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id='version-1'")
      .pluck().get()).toBe('body-1');
    expect(receiver.sqlite.prepare('PRAGMA quick_check').pluck().get()).toBe('ok');
    await fs.mkdir('.tmp/artifacts/T267', { recursive: true });
    await fs.writeFile(`.tmp/artifacts/T267/claim-revalidation-${nodeCount}.json`, JSON.stringify({
      cursor: retry.cursor, sentVersionIds: fixture.sentVersionIds, requests
    }, null, 2));
  } finally {
    vi.restoreAllMocks();
    await http.close();
    receiver.sqlite.close();
    revokeDesktopSyncGroupMemberStateReadiness(fixture.ids.receiver);
  }
}, 60_000);
