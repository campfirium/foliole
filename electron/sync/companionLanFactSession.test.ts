// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { encodeSyncPackFactClaims } from '../../lib/core/sync/syncPackFactPresence.js';
import { openDatabaseConnection } from '../database/connection.js';
import { insertNodeSyncState, mockedSyncPackBuilderAppDataDir,
  resolveSyncPackPath, setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { sessionRoot } from './companionLanDependencySession.js';
import { createCompanionFactSession, readCompanionFactSessionPage } from './companionLanFactSession.js';
import { activatePagedCompanionDependencySession } from './companionLanPagedDependencySession.js';
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
  devices: [{ device_identity_key: 'source', state: 'active' }]
}) }));
setupSyncPackBuilderTestLifecycle();

function seedHistory() {
  insertNodeSyncState();
  const driver = openDatabaseConnection().driver;
  for (let i = 1; i <= 129; i++) {
    const id = `v${String(i).padStart(4, '0')}`;
    const parent = i === 1 ? 'desktop#node-1-v1' : `v${String(i - 1).padStart(4, '0')}`;
    driver.execute(`INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, 'node-1', ?, 'desktop', 'now', ?, 'body', '{"id":"node-1","content":null}')`,
    [id, parent, `hash-${id}`]);
    driver.execute('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)', [id, parent]);
  }
  driver.execute("UPDATE nodes SET current_version_id = 'v0129' WHERE id = 'node-1'");
  driver.execute('UPDATE sync_object_state SET sync_dirty = 0');
}

function seedParentHistory() {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id, kind, title, created_at, updated_at)
    VALUES ('parent', 'topic', 'Parent', 'now', 'now')`);
  driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node', 'parent', 0, 'parent-hash', 'desktop', 'now', 0)`);
  for (let i = 1; i <= 129; i++) {
    const id = `p${String(i).padStart(4, '0')}`;
    const parent = i === 1 ? null : `p${String(i - 1).padStart(4, '0')}`;
    driver.execute(`INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, 'parent', ?, 'desktop', 'now', ?, 'body', '{"id":"parent","content":null}')`,
    [id, parent, `hash-${id}`]);
    if (parent) driver.execute('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)', [id, parent]);
  }
  driver.execute("UPDATE nodes SET current_version_id = 'p0129' WHERE id = 'parent'");
  driver.execute("UPDATE nodes SET parent_id = 'parent' WHERE id = 'node-1'");
}

async function readDependencyPack(url: URL, name: string) {
  const resource = await buildCompanionSyncPackResource(url, 'receiver');
  try {
    expect(resource.status).toBe('ready');
    const incoming = resolveSyncPackPath(name);
    const manifest = await extractSyncPackDatabaseFromFile({ archivePath: resource.filePath!,
      outputPath: incoming, expectedPeerId: 'receiver', expectedSourcePeerId: 'source',
      maxDatabaseBytes: 4 * 1024 * 1024 });
    const pack = new Database(incoming, { readonly: true });
    try {
      const rows = pack.prepare('SELECT row_json FROM sync_pack_dependency_page_rows ORDER BY row_index')
        .all() as { row_json: string }[];
      return { manifest, keys: rows.map((row) => JSON.parse(row.row_json).key.key as string) };
    } finally { pack.close(); }
  } finally { await resource.cleanup?.(); }
}

it('persists page claims by stable view and accepts only exact replay before publishing the next page', async () => {
  seedHistory();
  const source = openDatabaseConnection();
  const sourceState = source.driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const session = await createCompanionFactSession({ groupId: 'group', toPeerId: 'receiver',
    window: { fromStateSeq: 0, toStateSeq: 1, frontierStateSeq: sourceState.high_water,
      sourceEpoch: sourceState.source_epoch } });
  const viewId = session.view.sourceViewId;
  session.view.close();
  const args = { groupId: 'group', peerId: 'receiver', viewId };
  const first = await readCompanionFactSessionPage(args);
  expect('index' in first && first.complete).toBe(false);
  if (!('index' in first)) throw new Error('expected_fact_page');
  source.driver.execute("UPDATE node_sync_versions SET body_text = 'later'");
  const claimBits = encodeSyncPackFactClaims(first.index, {
    versions: first.index.versions.map((fact) => fact.version_id),
    parents: first.index.parents.map((fact) => JSON.stringify([
      fact.version_id, fact.parent_version_id, fact.ordinal])), reviews: [] });
  const claimed = { ...args, previousIndexId: first.index.index_id, claimBits };
  const second = await readCompanionFactSessionPage(claimed);
  expect('index' in second && second.index.index_id).not.toBe(first.index.index_id);
  expect(await readCompanionFactSessionPage(claimed)).toEqual(second);
  await expect(readCompanionFactSessionPage({ ...claimed,
    claimBits: { ...claimBits, versions: '00' } })).rejects.toThrow();
  const claims = new Database(path.join(sessionRoot('group', 'receiver'), viewId, 'fact-claims.db'),
    { readonly: true });
  try {
    expect((claims.prepare("SELECT count(*) AS count FROM known_facts WHERE kind = 'versions'")
      .get() as { count: number }).count).toBe(first.index.versions.length);
  } finally { claims.close(); }
});

it('rejects a fixed fact round when the source snapshot includes later changes', async () => {
  seedHistory();
  const driver = openDatabaseConnection().driver;
  const state = driver.queryOne<{ source_epoch: string }>(
    'SELECT source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  driver.execute("UPDATE sync_object_state SET state_seq = 4 WHERE object_type = 'node' AND object_id = 'node-1'");
  driver.execute('UPDATE sync_state_sequence SET high_water = 4 WHERE singleton_id = 1');
  await expect(createCompanionFactSession({ groupId: 'group', toPeerId: 'receiver',
    window: { fromStateSeq: 0, toStateSeq: 1, frontierStateSeq: 1,
      sourceEpoch: state.source_epoch } })).rejects.toThrow('sync_pack_source_view_unavailable');
});

it('converts persisted page claims into only missing dependency rows', async () => {
  seedHistory();
  const source = openDatabaseConnection();
  const state = source.driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const session = await createCompanionFactSession({ groupId: 'group', toPeerId: 'receiver',
    window: { fromStateSeq: 0, toStateSeq: 1, frontierStateSeq: state.high_water,
      sourceEpoch: state.source_epoch } });
  const viewId = session.view.sourceViewId;
  session.view.close();
  const args = { groupId: 'group', peerId: 'receiver', viewId };
  let page = await readCompanionFactSessionPage(args);
  for (let turn = 0; turn < 8 && 'index' in page; turn++) {
    const claimed = { versions: page.index.versions.filter((fact) =>
      !['v0128', 'v0129'].includes(fact.version_id)).map((fact) => fact.version_id),
    parents: page.index.parents.filter((fact) =>
      !['v0128', 'v0129'].includes(fact.version_id)).map((fact) => JSON.stringify([
      fact.version_id, fact.parent_version_id, fact.ordinal])), reviews: [] };
    page = await readCompanionFactSessionPage({ ...args,
      previousIndexId: page.index.index_id,
      claimBits: encodeSyncPackFactClaims(page.index, claimed) });
  }
  expect('ready' in page && page.ready).toBe(true);
  const dependency = await activatePagedCompanionDependencySession({
    groupId: 'group', fromPeerId: 'source', toPeerId: 'receiver', viewId });
  try {
    expect(dependency.transfer.expectedRows).toBe(4);
    expect(source.driver.queryAll('SELECT version_id FROM node_version_outbound_payload_holds WHERE pack_id = ?',
      [viewId])).toHaveLength(2);
  } finally { dependency.view.close(); }
  const url = new URL(`http://localhost/companion/sync-pack?page_contract=bounded-v1&after_state_seq=0&fact_view=${viewId}`);
  const first = await readDependencyPack(url, 'paged-facts-first.db');
  expect(first.manifest.dependencyPage?.transfer.expectedRows).toBe(4);
  expect(first.keys).toEqual(['v0128', 'v0129']);
  const next = new URL(url);
  next.searchParams.delete('fact_view');
  next.searchParams.set('dependency_view', viewId);
  next.searchParams.set('dependency_after_row', '2');
  next.searchParams.set('dependency_digest', first.manifest.dependencyPage!.afterDigest);
  next.searchParams.set('dependency_table', 'node_sync_versions');
  next.searchParams.set('dependency_key', 'v0129');
  next.searchParams.set('dependency_ordinal', '-1');
  const second = await readDependencyPack(next, 'paged-facts-second.db');
  expect(second.keys).toEqual(['v0128', 'v0129']);
});

it('publishes an all-known history without retransmitting any version body', async () => {
  seedHistory();
  const source = openDatabaseConnection();
  const state = source.driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const session = await createCompanionFactSession({ groupId: 'group', toPeerId: 'receiver',
    window: { fromStateSeq: 0, toStateSeq: 1, frontierStateSeq: state.high_water,
      sourceEpoch: state.source_epoch } });
  const viewId = session.view.sourceViewId;
  session.view.close();
  const args = { groupId: 'group', peerId: 'receiver', viewId };
  let page = await readCompanionFactSessionPage(args);
  for (let turn = 0; turn < 8 && 'index' in page; turn++) {
    const claims = { versions: page.index.versions.map((fact) => fact.version_id),
      parents: page.index.parents.map((fact) => JSON.stringify([
        fact.version_id, fact.parent_version_id, fact.ordinal])), reviews: [] };
    page = await readCompanionFactSessionPage({ ...args,
      previousIndexId: page.index.index_id,
      claimBits: encodeSyncPackFactClaims(page.index, claims) });
  }
  expect('ready' in page && page.ready).toBe(true);
  const url = new URL(`http://localhost/companion/sync-pack?page_contract=bounded-v1&after_state_seq=0&fact_view=${viewId}`);
  const resource = await buildCompanionSyncPackResource(url, 'receiver');
  try {
    const incoming = resolveSyncPackPath('all-known-incoming.db');
    const manifest = await extractSyncPackDatabaseFromFile({ archivePath: resource.filePath!,
      outputPath: incoming, expectedPeerId: 'receiver', expectedSourcePeerId: 'source',
      maxDatabaseBytes: 4 * 1024 * 1024 });
    expect(manifest.dependencyTransfers?.[0]?.expectedRows).toBe(0);
    const pack = new Database(incoming, { readonly: true });
    try {
      expect(pack.prepare('SELECT count(*) AS count FROM node_sync_versions').get()).toEqual({ count: 0 });
    } finally { pack.close(); }
  } finally { await resource.cleanup?.(); }
});

it('includes a historical parent prelude in the same bounded transfer', async () => {
  seedHistory();
  seedParentHistory();
  const source = openDatabaseConnection();
  const state = source.driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const session = await createCompanionFactSession({ groupId: 'group', toPeerId: 'receiver',
    window: { fromStateSeq: 0, toStateSeq: 1, frontierStateSeq: state.high_water,
      sourceEpoch: state.source_epoch } });
  const viewId = session.view.sourceViewId;
  session.view.close();
  let page = await readCompanionFactSessionPage({ groupId: 'group', peerId: 'receiver', viewId });
  for (let turn = 0; turn < 10 && 'index' in page; turn++) {
    const known = { versions: page.index.versions.filter((fact) =>
      !['p0128', 'p0129'].includes(fact.version_id)).map((fact) => fact.version_id),
    parents: page.index.parents.filter((fact) =>
      !['p0128', 'p0129'].includes(fact.version_id)).map((fact) => JSON.stringify([
      fact.version_id, fact.parent_version_id, fact.ordinal])), reviews: [] };
    page = await readCompanionFactSessionPage({ groupId: 'group', peerId: 'receiver', viewId,
      previousIndexId: page.index.index_id,
      claimBits: encodeSyncPackFactClaims(page.index, known) });
  }
  expect('ready' in page && page.ready).toBe(true);
  const dependency = await activatePagedCompanionDependencySession({
    groupId: 'group', fromPeerId: 'source', toPeerId: 'receiver', viewId });
  try {
    expect(dependency.transfer.nodeIds).toEqual(['node-1', 'parent']);
    expect(dependency.transfer.expectedRows).toBe(4);
  } finally { dependency.view.close(); }
});
