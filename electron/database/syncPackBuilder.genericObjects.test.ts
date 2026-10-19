import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { replaceNodeOrder } from '../../lib/core/database/nodeOrderMutations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';

import { openDatabaseConnection } from './connection.js';
import { flushDirtyNodeSyncVersions } from './nodeSyncVersions.js';
import { insertAttachmentSyncState, insertExternalFolderSyncState, insertImportSourceSyncState,
  insertNodeReadingSyncState, insertNodeReviewSyncState, insertPdfPageTextSyncState,
  insertViewStateSyncState, prepareGenericRequestFacts } from './requestGenericObjects.testSupport.js';
import { mockedRequestProjectionAppDataDir, ownerPort, projectionPeer, setupRequestProjection,
  transferProjection } from './requestProjection.testSupport.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedRequestProjectionAppDataDir,
  app_cache_dir: path.join(mockedRequestProjectionAppDataDir, 'cache'),
  app_config_dir: path.join(mockedRequestProjectionAppDataDir, 'config'),
  app_log_dir: path.join(mockedRequestProjectionAppDataDir, 'logs')
}) }));
setupRequestProjection();

async function receive() {
  prepareGenericRequestFacts();
  const target = projectionPeer('target');
  await transferProjection(ownerPort(), target.db);
  return target.sqlite;
}

it('transfers a changed direct-child sequence without creating article versions', async () => {
  const { driver, dbPath } = openDatabaseConnection();
  bindParentOrderWriter(driver, { deviceAnchor: 'request-test', libraryPath: dbPath });
  const now = '2026-09-27T00:00:00.000Z';
  const target = projectionPeer('target');
  for (const id of ['node-a', 'node-b']) {
    const sql = `INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at, sync_dirty)
      VALUES (?, NULL, 'topic', ?, '', ?, ?, 0)`;
    driver.execute(sql, [id, id, now, now]); target.sqlite.prepare(sql).run(id, id, now, now);
  }
  replaceNodeOrder(driver, ['node-a', 'node-b']); flushDirtyNodeSyncVersions(now);
  await transferProjection(ownerPort(), target.db);
  const before = await readFramedSyncInventory(ownerPort());
  const targetVersions = target.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  const versions = driver.queryAll('SELECT * FROM node_sync_versions');
  replaceNodeOrder(driver, ['node-b', 'node-a']);
  expect(driver.queryAll('SELECT * FROM node_sync_versions')).toEqual(versions);
  const differences = compareFramedSyncInventories({ local: await readFramedSyncInventory(ownerPort()), remote: before });
  expect(differences.filter(row => row.direction === 'local_to_remote').map(row => row.objectType))
    .toEqual(['parent_child_order']);
  await transferProjection(ownerPort(), target.db);
  expect(target.sqlite.prepare('SELECT child_ids_json FROM parent_child_order').pluck().all()).toEqual(['["node-b","node-a"]']);
  expect(target.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(targetVersions);
});

it('ignores retired independent attachment state', async () => {
  insertAttachmentSyncState();
  expect(await readFramedSyncInventory(ownerPort())).toEqual([]);
  const target = await receive();
  expect(target.prepare('SELECT * FROM sync_object_state').all()).toEqual([]);
});

it('transfers the reported external folder path without creating a local source binding', async () => {
  insertExternalFolderSyncState();
  const target = await receive();
  const row = target.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.external_folder).get('folder-1') as { payload_json: string };
  expect(JSON.parse(row.payload_json)).toEqual({
    attachment_mode: 'document_relative_first_then_fixed_root', excluded_dirs_json: '[".git"]',
    folder_path: '/library', host_name: 'desktop', host_platform: 'darwin', id: 'folder-1', source_ref: 'external:folder-1'
  });
  expect(target.prepare('SELECT folder_path, attachment_root_path FROM external_search_folders WHERE id = ?').get('folder-1'))
    .toEqual({ folder_path: '/library', attachment_root_path: null });
  expect(JSON.stringify(target.prepare('SELECT * FROM desktop_sources').all())).not.toContain('/library');
});

it('transfers import source metadata and its watched binding without the local absolute path', async () => {
  insertImportSourceSyncState();
  const target = await receive();
  expect(target.prepare('SELECT source_fingerprint, watched_binding_id, watched_relative_path, source_locator FROM import_sources').all())
    .toEqual([{ source_fingerprint: 'source-1', watched_binding_id: 'watched-source-1', watched_relative_path: 'notes.md', source_locator: '' }]);
});

it('omits retired independent PDF page state while preserving its local text and dimensions', async () => {
  insertPdfPageTextSyncState();
  expect(await readFramedSyncInventory(ownerPort())).toEqual([]);
  const target = await receive();
  expect(target.prepare('SELECT * FROM pdf_page_text').all()).toEqual([]);
  expect(openDatabaseConnection().driver.queryAll('SELECT attachment_id, page, text, page_width, page_height FROM pdf_page_text'))
    .toEqual([{ attachment_id: 'pdf-1', page: 1, text: 'page text', page_width: 612, page_height: 792 }]);
});

it('transfers original review operations with the node review state', async () => {
  insertNodeReviewSyncState();
  const source = openDatabaseConnection().driver;
  const logs = source.queryAll('SELECT * FROM review_log');
  const review = source.queryAll('SELECT * FROM node_review');
  const target = await receive();
  expect(target.prepare('SELECT * FROM review_log').all()).toEqual(logs);
  expect(target.prepare('SELECT * FROM node_review').all()).toEqual(review);
  expect(logs).toEqual([expect.objectContaining({ grade: 3, node_id: 'node-review-1', op_id: 'op-1' })]);
});

it('transfers live reading state atomically with its node', async () => {
  insertNodeReadingSyncState();
  const reading = openDatabaseConnection().driver.queryAll('SELECT * FROM node_reading');
  const target = await receive();
  expect(target.prepare('SELECT * FROM node_reading').all()).toEqual(reading);
  expect(target.prepare("SELECT id FROM nodes WHERE id = 'node-reading-1'").get()).toEqual({ id: 'node-reading-1' });
});

it('omits stale reading state without a backing reading row while retaining the node', async () => {
  insertNodeReadingSyncState();
  prepareGenericRequestFacts();
  openDatabaseConnection().driver.execute("DELETE FROM node_reading WHERE node_id = 'node-reading-1'");
  expect((await readFramedSyncInventory(ownerPort())).find(entry => entry.objectType === 'node')?.stateFactIds)
    .toEqual([]);
  const target = await receive();
  expect(target.prepare('SELECT * FROM node_reading').all()).toEqual([]);
  expect(target.prepare("SELECT * FROM sync_object_state WHERE object_type = 'node_reading'").all()).toEqual([]);
  expect(target.prepare("SELECT id FROM nodes WHERE id = 'node-reading-1'").get()).toEqual({ id: 'node-reading-1' });
});

it('refreshes a stale reading inventory during desktop retirement without changing original facts', () => {
  insertNodeReadingSyncState(); prepareGenericRequestFacts();
  const { sqlite } = openDatabaseConnection();
  sqlite.exec("DELETE FROM node_reading WHERE node_id = 'node-reading-1'");
  sqlite.exec(`UPDATE framed_sync_inventory SET states_json = '["node_reading:stale"]'
    WHERE object_type = 'node' AND object_id = 'node-reading-1'`);
  const tables = ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'sync_object_state'];
  const facts = () => tables.map(table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
  const before = facts();
  sqlite.pragma('user_version = 152'); initializeDatabaseSchema(sqlite);
  expect(sqlite.prepare("SELECT states_json FROM framed_sync_inventory WHERE object_id = 'node-reading-1'").pluck().get())
    .toBe('[]');
  expect(facts()).toEqual(before);
});

it('keeps host view state local instead of publishing the private active node', async () => {
  insertViewStateSyncState();
  const original = openDatabaseConnection().driver.queryAll('SELECT * FROM workspace_meta');
  expect(await readFramedSyncInventory(ownerPort())).toEqual([]);
  const target = await receive();
  expect(target.prepare('SELECT * FROM workspace_meta').all()).toEqual([]);
  expect(target.prepare("SELECT * FROM sync_object_state WHERE object_type = 'view_state'").all()).toEqual([]);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM workspace_meta')).toEqual(original);
});
