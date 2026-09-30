// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { encodeSyncPackFactClaims } from '../../lib/core/sync/syncPackFactPresence.js';
import { openDatabaseConnection } from '../database/connection.js';
import { insertNodeSyncState, mockedSyncPackBuilderAppDataDir,
  setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { sessionRoot } from './companionLanDependencySession.js';
import { createCompanionFactSession,
  openCompanionFactSession } from './companionLanFactSession.js';
import { openCompanionSourceRoundView,
  releaseCompanionSourceRoundOnReceipt } from './companionLanSourceRoundView.js';
import { buildCompanionSyncPackResource } from './companionLanSyncPack.js';
import { handleCompanionSyncPackFactsGet,
  loadCompanionSyncPackFactIndex } from './companionLanSyncPackFacts.js';

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
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' })
}));
setupSyncPackBuilderTestLifecycle();

function seedGroup() {
  const driver = openDatabaseConnection().driver;
  driver.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  driver.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', 'source', 'active', 'now')");
  for (const peerId of ['source', 'receiver']) driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
     platform, state, joined_at, updated_at) VALUES ('group', ?, ?, '/source', ?, 'mac', 'active', 'now', 'now')`,
  [peerId, peerId, peerId]);
}

it('reuses one frozen round source across fact windows and releases it on final receipt', async () => {
  insertNodeSyncState();
  seedGroup();
  const driver = openDatabaseConnection().driver;
  for (let seq = 3; seq <= 33; seq++) driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, updated_at, sync_dirty,
      last_modified_by_host_name) VALUES ('node', ?, ?, 'orphan', 'now', 0, 'source')`,
  [`orphan-${seq}`, seq]);
  driver.execute('UPDATE sync_state_sequence SET high_water = 33 WHERE singleton_id = 1');
  const state = driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const scope = { groupId: 'group', peerId: 'receiver',
    frontierStateSeq: state.high_water, sourceEpoch: state.source_epoch };
  const first = await createCompanionFactSession({ groupId: scope.groupId,
    toPeerId: scope.peerId, window: { fromStateSeq: 0, toStateSeq: 32,
      frontierStateSeq: scope.frontierStateSeq, sourceEpoch: scope.sourceEpoch } });
  first.view.close();
  driver.execute(`UPDATE node_sync_versions SET snapshot_json =
    '{"id":"node-1","content":"later"}' WHERE version_id = 'desktop#node-1-v1'`);
  const second = await createCompanionFactSession({ groupId: scope.groupId,
    toPeerId: scope.peerId, window: { fromStateSeq: 32, toStateSeq: 33,
      frontierStateSeq: scope.frontierStateSeq, sourceEpoch: scope.sourceEpoch } });
  try {
    expect(second.view.sourceViewId).not.toBe(first.view.sourceViewId);
    expect(second.view.driver.queryOne<{ snapshot_json: string }>(
      "SELECT snapshot_json FROM node_sync_versions WHERE version_id = 'desktop#node-1-v1'"
    )?.snapshot_json).toContain('node body must stay out of pack');
  } finally { second.view.close(); }
  const root = path.join(sessionRoot(scope.groupId, scope.peerId), '.round-source');
  await fs.access(path.join(root, 'source.db'));
  const roundFile = await fs.stat(path.join(root, 'source.db'));
  for (const viewId of [first.view.sourceViewId, second.view.sourceViewId]) {
    const sessionFile = await fs.stat(path.join(sessionRoot(scope.groupId, scope.peerId),
      viewId, 'source.db'));
    expect([sessionFile.dev, sessionFile.ino]).toEqual([roundFile.dev, roundFile.ino]);
  }
  const url = new URL('http://localhost/companion/sync-pack?page_contract=bounded-v1&after_state_seq=32');
  url.searchParams.set('frontier_state_seq', String(scope.frontierStateSeq));
  url.searchParams.set('source_epoch', scope.sourceEpoch);
  const index = loadCompanionSyncPackFactIndex(url, scope.peerId);
  const bits = encodeSyncPackFactClaims(index, { versions: [], parents: [], reviews: [] });
  url.searchParams.set('fact_index_id', index.index_id);
  url.searchParams.set('round_source_view_id', index.round_source_view_id!);
  url.searchParams.set('have_v', bits.versions);
  url.searchParams.set('have_p', bits.parents);
  url.searchParams.set('have_r', bits.reviews);
  const resource = await buildCompanionSyncPackResource(url, scope.peerId);
  try { expect(resource.status).toBe('ready'); }
  finally { await resource.cleanup?.(); }
  const [packId] = await fs.readdir(path.join(root, 'final-packs'));
  expect(packId).toMatch(/^[a-f0-9-]{36}$/u);
  await releaseCompanionSourceRoundOnReceipt(scope.groupId, scope.peerId, packId!);
  await expect(fs.access(root)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('starts a new frozen source for a fresh request at the same frontier', async () => {
  insertNodeSyncState();
  const driver = openDatabaseConnection().driver;
  const state = driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const args = { groupId: 'group', toPeerId: 'receiver',
    window: { fromStateSeq: 0, toStateSeq: 2,
      frontierStateSeq: state.high_water, sourceEpoch: state.source_epoch } };
  const first = await createCompanionFactSession(args);
  first.view.close();
  driver.execute(`UPDATE node_sync_versions SET snapshot_json =
    '{"id":"node-1","content":"new round"}' WHERE version_id = 'desktop#node-1-v1'`);
  const second = await createCompanionFactSession({ ...args, freshRound: true });
  try {
    expect(second.view.driver.queryOne<{ snapshot_json: string }>(
      "SELECT snapshot_json FROM node_sync_versions WHERE version_id = 'desktop#node-1-v1'"
    )?.snapshot_json).toContain('new round');
  } finally { second.view.close(); }
});

it('rebases instead of rebuilding a lost round at the same frontier', async () => {
  insertNodeSyncState();
  const driver = openDatabaseConnection().driver;
  const state = driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const scope = { groupId: 'group', peerId: 'receiver',
    frontierStateSeq: state.high_water, sourceEpoch: state.source_epoch };
  const session = await createCompanionFactSession({ groupId: scope.groupId,
    toPeerId: scope.peerId, window: { fromStateSeq: 0, toStateSeq: 2,
      frontierStateSeq: scope.frontierStateSeq, sourceEpoch: scope.sourceEpoch } });
  session.view.close();
  await fs.rm(path.join(sessionRoot(scope.groupId, scope.peerId), '.round-source'),
    { recursive: true });
  const request = new URL('http://localhost/companion/sync-pack-facts?' +
    'page_contract=bounded-v1&after_state_seq=0');
  request.searchParams.set('frontier_state_seq', String(scope.frontierStateSeq));
  request.searchParams.set('source_epoch', scope.sourceEpoch);
  const writeJson = vi.fn();
  await handleCompanionSyncPackFactsGet({} as never, {} as never,
    request, scope.peerId, writeJson);
  expect(writeJson.mock.calls[0]?.[2]).toBe(409);
  expect(writeJson.mock.calls[0]?.[3]).toEqual({ error: 'sync_pack_source_view_unavailable' });
  expect(await fs.readdir(sessionRoot(scope.groupId, scope.peerId)))
    .not.toContain('.round-source');
});

it('rebases a saved fact session without a round source identity', async () => {
  insertNodeSyncState();
  const driver = openDatabaseConnection().driver;
  const state = driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const session = await createCompanionFactSession({ groupId: 'group', toPeerId: 'receiver',
    window: { fromStateSeq: 0, toStateSeq: 2,
      frontierStateSeq: state.high_water, sourceEpoch: state.source_epoch } });
  const viewId = session.view.sourceViewId;
  session.view.close();
  const file = path.join(sessionRoot('group', 'receiver'), viewId, 'fact-session.json');
  const saved = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
  delete saved.roundSourceViewId;
  await fs.writeFile(file, JSON.stringify(saved));
  await expect(openCompanionFactSession('group', 'receiver', viewId))
    .rejects.toThrow('sync_pack_source_view_unavailable');
});

it('refuses a direct pack fact index after its round source disappears', async () => {
  insertNodeSyncState();
  seedGroup();
  const driver = openDatabaseConnection().driver;
  const state = driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const scope = { groupId: 'group', peerId: 'receiver',
    frontierStateSeq: state.high_water, sourceEpoch: state.source_epoch };
  const session = await createCompanionFactSession({ groupId: scope.groupId,
    toPeerId: scope.peerId, window: { fromStateSeq: 0, toStateSeq: 2,
      frontierStateSeq: scope.frontierStateSeq, sourceEpoch: scope.sourceEpoch } });
  session.view.close();
  const round = openCompanionSourceRoundView(scope)!;
  const roundId = round.sourceViewId;
  round.close();
  const url = new URL('http://localhost/companion/sync-pack?' +
    'page_contract=bounded-v1&after_state_seq=0');
  url.searchParams.set('frontier_state_seq', String(scope.frontierStateSeq));
  url.searchParams.set('source_epoch', scope.sourceEpoch);
  url.searchParams.set('fact_index_id', 'claimed');
  expect(() => loadCompanionSyncPackFactIndex(url, scope.peerId))
    .toThrow('sync_pack_upgrade_required');
  url.searchParams.set('round_source_view_id', roundId);
  await fs.rm(path.join(sessionRoot(scope.groupId, scope.peerId), '.round-source'),
    { recursive: true });
  expect(() => loadCompanionSyncPackFactIndex(url, scope.peerId))
    .toThrow('sync_pack_source_view_unavailable');
  await expect(buildCompanionSyncPackResource(url, scope.peerId))
    .rejects.toThrow('sync_pack_source_view_unavailable');
});
