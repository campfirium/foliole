// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { dependencyResumeUrl } from '../../lib/core/sync/syncPackDependencyResume.js';
import { encodeSyncPackFactClaims } from '../../lib/core/sync/syncPackFactPresence.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { insertNodeReviewSyncState, insertNodeSyncState, mockedSyncPackBuilderAppDataDir,
  readPackRows, resolveSyncPackPath, setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

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

async function twoNodeFactView() {
  insertNodeSyncState();
  const driver = openDatabaseConnection().driver;
  driver.execute("DELETE FROM sync_object_state WHERE object_type = 'setting'");
  driver.execute(`INSERT INTO nodes (id, kind, title, current_version_id, created_at, updated_at)
    VALUES ('shared-parent', 'folder', 'Shared', 'source#parent-v1', 'now', 'now')`);
  driver.execute(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash,
      body_text, snapshot_json)
    VALUES ('source#parent-v1', 'shared-parent', NULL, 'source', 'now', 'parent-hash',
      'parent', '{"id":"shared-parent","title":"Shared","content":"parent"}')`);
  driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name,
      updated_at, sync_dirty)
    VALUES ('node', 'shared-parent', 0, 'parent-hash', 'source', 'now', 0)`);
  driver.execute("UPDATE nodes SET parent_id = 'shared-parent' WHERE id = 'node-1'");
  driver.execute(`INSERT INTO nodes (id, parent_id, kind, title, current_version_id, created_at, updated_at)
    VALUES ('node-2', 'shared-parent', 'topic', 'Node 2', 'source#node-2-v1', 'now', 'now')`);
  driver.execute(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash,
      body_text, snapshot_json)
    VALUES ('source#node-2-v1', 'node-2', NULL, 'source', 'now', 'node-2-hash',
      'body-2', '{"id":"node-2","title":"Node 2","content":"body-2"}')`);
  driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name,
      updated_at, sync_dirty)
    VALUES ('node', 'node-2', 2, 'node-2-hash', 'source', 'now', 0)`);
  driver.execute('UPDATE sync_state_sequence SET high_water = 2 WHERE singleton_id = 1');
  const epoch = driver.queryOne<{ source_epoch: string }>(
    'SELECT source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!.source_epoch;
  const session = await createCompanionFactSession({ groupId: 'group', toPeerId: 'receiver',
    window: { fromStateSeq: 0, toStateSeq: 2, frontierStateSeq: 2, sourceEpoch: epoch } });
  const viewId = session.view.sourceViewId;
  session.view.close();
  const first = await readCompanionFactSessionPage({ groupId: 'group', peerId: 'receiver', viewId });
  if (!('index' in first)) throw new Error('expected_fact_page');
  const ready = await readCompanionFactSessionPage({ groupId: 'group', peerId: 'receiver', viewId,
    previousIndexId: first.index.index_id,
    claimBits: encodeSyncPackFactClaims(first.index, { versions: [], parents: [], reviews: [] }) });
  expect('ready' in ready && ready.ready).toBe(true);
  return { viewId, epoch };
}

async function applyArchivedPack(target: Database.Database, archivePath: string, number: number) {
  const incoming = resolveSyncPackPath(`two-node-incoming-${number}.db`);
  await extractSyncPackDatabaseFromFile({ archivePath, outputPath: incoming,
    expectedPeerId: 'receiver', expectedSourcePeerId: 'source', maxDatabaseBytes: 4 * 1024 * 1024 });
  const port = createBetterSqliteDbPort(target);
  await port.run('ATTACH DATABASE ? AS inc', [incoming]);
  try { return await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0,
    hostName: 'receiver', sourcePeerId: 'source', recordVersionReceipt: true,
    enqueueSearchInvalidations: false }); }
  finally { await port.run('DETACH DATABASE inc'); }
}

it('stages two nodes and advances dependency pages before publishing their state window', async () => {
  const { viewId, epoch } = await twoNodeFactView();
  const session = await activatePagedCompanionDependencySession({
    groupId: 'group', fromPeerId: 'source', toPeerId: 'receiver', viewId });
  try { expect(session.transfers?.map((transfer) => transfer.objectId)).toEqual(['node-1', 'node-2']); }
  finally { session.view.close(); }
  let url = new URL(`http://localhost/companion/sync-pack?page_contract=bounded-v1` +
    `&after_state_seq=0&frontier_state_seq=2&source_epoch=${epoch}&dependency_view=${viewId}`);
  const oldResume = new URL(url);
  oldResume.searchParams.set('dependency_after_row', '1');
  await expect(buildCompanionSyncPackResource(oldResume, 'receiver'))
    .rejects.toThrow('sync_pack_upgrade_required');
  const targetPath = resolveSyncPackPath('two-node-target.db');
  let target = new Database(targetPath);
  try {
    target.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    target.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
      INSERT INTO sync_group_local_state VALUES (1, 'group', 'receiver', 'active', 'now');
      INSERT INTO sync_group_devices
        (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
          platform, state, joined_at, updated_at)
      VALUES ('group', 'source', 'source-anchor', '/source', 'Source', 'mac', 'active', 'now', 'now')`);
    const objectIds: string[] = [];
    for (let turn = 0; turn < 8; turn++) {
      const resource = await buildCompanionSyncPackResource(url, 'receiver');
      try {
        const manifest = readPackRows(resource.filePath!).manifest;
        const result = await applyArchivedPack(target, resource.filePath!, turn);
        if (!result.dependencyProgress) {
          expect(manifest.dependency_transfers).toHaveLength(2);
          expect(result.toStateSeq).toBe(2);
          break;
        }
        objectIds.push(result.dependencyProgress.transfer.objectId);
        expect(result.toStateSeq).toBe(0);
        expect(target.prepare('SELECT count(*) AS count FROM node_sync_versions').get())
          .toEqual({ count: 0 });
        url = new URL(dependencyResumeUrl(url.href, result.dependencyProgress));
        if (turn === 0) { target.close(); target = new Database(targetPath); }
      } finally { await resource.cleanup?.(); }
    }
    expect(objectIds).toEqual(['node-1', 'node-2']);
    expect(target.prepare('SELECT count(*) AS count FROM node_sync_versions').get())
      .toEqual({ count: 3 });
  } finally { target.close(); }
});

it('stages missing node history when the changed object is node open state', async () => {
  insertNodeSyncState();
  const driver = openDatabaseConnection().driver;
  driver.execute("UPDATE sync_object_state SET state_seq = 10 WHERE object_type = 'node'");
  driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
    VALUES ('node_open_state', 'node-1', 3, 'open-hash', 'desktop', 'now')`);
  driver.execute('UPDATE sync_state_sequence SET high_water = 10 WHERE singleton_id = 1');
  const epoch = driver.queryOne<{ source_epoch: string }>(
    'SELECT source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!.source_epoch;
  const session = await createCompanionFactSession({ groupId: 'group', toPeerId: 'receiver',
    window: { fromStateSeq: 2, toStateSeq: 10, frontierStateSeq: 10, sourceEpoch: epoch } });
  const viewId = session.view.sourceViewId;
  session.view.close();
  const first = await readCompanionFactSessionPage({ groupId: 'group', peerId: 'receiver', viewId });
  if (!('index' in first)) throw new Error('expected_fact_page');
  expect(first.index.versions).toHaveLength(1);
  const ready = await readCompanionFactSessionPage({ groupId: 'group', peerId: 'receiver', viewId,
    previousIndexId: first.index.index_id,
    claimBits: encodeSyncPackFactClaims(first.index, { versions: [], parents: [], reviews: [] }) });
  expect('ready' in ready && ready.ready).toBe(true);
  const dependency = await activatePagedCompanionDependencySession({
    groupId: 'group', fromPeerId: 'source', toPeerId: 'receiver', viewId });
  try {
    expect(dependency.transfer).toMatchObject({ objectType: 'node_open_state', objectId: 'node-1',
      objectStateSeq: 3, expectedRows: 1 });
  } finally { dependency.view.close(); }
});

it('sends only the missing review event after 260 facts are checked in pages', async () => {
  insertNodeReviewSyncState();
  const source = openDatabaseConnection();
  for (let i = 1; i < 260; i++) {
    const op = `op-${String(i).padStart(4, '0')}`;
    source.driver.execute(`INSERT INTO review_log
      (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
       due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after)
      VALUES (?, ?, 'source', 'node-review-1', 3, 'ts-fsrs@4', 'now', 'before', 1, 2, 'after', 3, 4)`,
    [`review-${i}`, op]);
  }
  const state = source.driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const session = await createCompanionFactSession({ groupId: 'group', toPeerId: 'receiver',
    window: { fromStateSeq: 1, toStateSeq: 6, frontierStateSeq: state.high_water,
      sourceEpoch: state.source_epoch } });
  const viewId = session.view.sourceViewId;
  session.view.close();
  const args = { groupId: 'group', peerId: 'receiver', viewId };
  let page = await readCompanionFactSessionPage(args);
  let reviewCount = 0;
  for (let turn = 0; turn < 8 && 'index' in page; turn++) {
    reviewCount += page.index.reviews.length;
    const claims = { versions: page.index.versions.map((fact) => fact.version_id),
      parents: page.index.parents.map((fact) => JSON.stringify([
        fact.version_id, fact.parent_version_id, fact.ordinal])),
      reviews: page.index.reviews.filter((fact) => fact.op_id !== 'op-0259').map((fact) => fact.op_id) };
    page = await readCompanionFactSessionPage({ ...args,
      previousIndexId: page.index.index_id,
      claimBits: encodeSyncPackFactClaims(page.index, claims) });
  }
  expect(reviewCount).toBe(260);
  expect('ready' in page && page.ready).toBe(true);
  const dependency = await activatePagedCompanionDependencySession({
    groupId: 'group', fromPeerId: 'source', toPeerId: 'receiver', viewId });
  try {
    expect(dependency.transfer.objectType).toBe('node_review');
    expect(dependency.transfer.expectedRows).toBe(1);
  } finally { dependency.view.close(); }
  const url = new URL(`http://localhost/companion/sync-pack?page_contract=bounded-v1&after_state_seq=1&dependency_view=${viewId}`);
  const resource = await buildCompanionSyncPackResource(url, 'receiver');
  try {
    const incoming = resolveSyncPackPath('review-dependency.db');
    await extractSyncPackDatabaseFromFile({ archivePath: resource.filePath!, outputPath: incoming,
      expectedPeerId: 'receiver', expectedSourcePeerId: 'source', maxDatabaseBytes: 4 * 1024 * 1024 });
    const pack = new Database(incoming, { readonly: true });
    try {
      const row = pack.prepare('SELECT row_json FROM sync_pack_dependency_page_rows').get() as { row_json: string };
      expect(JSON.parse(row.row_json)).toMatchObject({ table: 'review_log', key: { key: 'op-0259' } });
    } finally { pack.close(); }
  } finally { await resource.cleanup?.(); }
});
