// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { observeDriver } from '../../../electron/database/bodyContentDriver.testSupport.js';
import { loadNodeTextAlternativePreviewWithDriver } from '../../../electron/database/nodeTextAlternatives.js';

import { migrateBodyContentStorage } from './bodyContentMigration.js';
import { upsertTextBodyBlob } from './contentBodyBlobs.js';
import { initializeDatabaseSchema } from './migrations.js';
import { NodeBodyUnavailableError } from './nodeBodyResolution.js';
import { loadNodeSourceDetails } from './nodeSourceDetails.js';
import { loadTopicTextBodiesWithDriver } from './topicTextBodiesWithDriver.js';
import { loadWorkspaceNodeDocument } from './workspaceNodeDocument.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));

function host() {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  initializeDatabaseSchema(sqlite);
  sqlite.exec("INSERT INTO settings (key,value,updated_at) VALUES ('host_name','test-host','now')");
  const driver = createBetterSqlite3Driver(sqlite);
  const insert = (id: string, body: string, kind = 'topic', parent: string | null = null) => {
    const hash = upsertTextBodyBlob(driver, body, 'now');
    sqlite.prepare(`INSERT INTO nodes (id,kind,title,content,body_blob_hash,parent_id,created_at,updated_at)
      VALUES (?, ?, 'Title', '', ?, ?, 'now', 'now')`).run(id, kind, hash, parent);
    return hash;
  };
  return { sqlite, driver, insert, db: createBetterSqliteDbPort(sqlite) };
}

it('preserves document, inherited source and includeBody snapshots after continuous data removal', async () => {
  const value = host();
  const bodies = ['', '  ', '\uFEFF中文\0😀', '中😀'.repeat(500_000)];
  bodies.forEach((body, index) => value.insert(`node-${index}`, body));
  value.insert('child', '', 'topic', 'node-3');
  value.sqlite.exec("UPDATE nodes SET anchor_link = '{}' WHERE id = 'child'");
  value.sqlite.exec(`INSERT INTO nodes (id,kind,title,content,created_at,updated_at)
    VALUES ('folder','folder','Folder','','now','now')`);
  const documents = [...bodies.map((_, index) => `node-${index}`), 'folder'].map((id) =>
    ({ id, document: loadWorkspaceNodeDocument(value.driver, id), source: loadNodeSourceDetails(value.driver, id) }));
  const inherited = loadNodeSourceDetails(value.driver, 'child');
  const snapshot = loadWorkspaceSnapshot(value.driver, { includeBody: true });
  await migrateBodyContentStorage(value.db);
  snapshot!.nodesById.folder!.bodyBlobHash = value.driver.queryOne<{ body_blob_hash: string }>(
    "SELECT body_blob_hash FROM nodes WHERE id = 'folder'")!.body_blob_hash;
  value.sqlite.exec('DROP TABLE content_blob_data');
  const reads = observeDriver(value.driver);
  for (const expected of documents) {
    expect(loadWorkspaceNodeDocument(reads.driver, expected.id, 'chunked')).toEqual(expected.document);
    expect(loadNodeSourceDetails(reads.driver, expected.id, 6, 'chunked')).toEqual(expected.source);
  }
  expect(loadNodeSourceDetails(value.driver, 'child', 6, 'chunked')).toEqual(inherited);
  expect(loadWorkspaceSnapshot(reads.driver, { includeBody: true }, 'chunked')).toEqual(snapshot);
  expect(Math.max(...reads.sizes)).toBeLessThanOrEqual(512 * 1024);
  expect(loadWorkspaceNodeDocument(value.driver, 'missing', 'chunked')).toBeNull();
  expect(loadNodeSourceDetails(value.driver, 'missing', 6, 'chunked')).toBeNull();
});

it('preserves unavailable, fetching and failed results without exposing stale inline text', async () => {
  const value = host();
  const hash = value.insert('node', 'Original');
  await migrateBodyContentStorage(value.db);
  value.sqlite.prepare('DELETE FROM content_bodies WHERE hash = ?').run(hash);
  value.sqlite.exec("UPDATE nodes SET content = 'Stale inline' WHERE id = 'node'");
  expect(loadWorkspaceNodeDocument(value.driver, 'node', 'chunked')).toBeNull();
  expect(loadNodeSourceDetails(value.driver, 'node', 6, 'chunked'))
    .toMatchObject({ sourceNodeContent: null, sourceNodeBodyStatus: 'unavailable' });
  for (const status of ['missing', 'fetching', 'failed']) {
    value.sqlite.prepare('UPDATE content_blobs SET availability = ? WHERE hash = ?').run(status, hash);
    expect(loadWorkspaceSnapshot(value.driver, { includeBody: true }, 'chunked')?.nodesById.node)
      .toMatchObject({ content: '', bodyStatus: status });
  }
  value.sqlite.exec("UPDATE nodes SET body_blob_hash = NULL WHERE id = 'node'");
  expect(() => loadWorkspaceNodeDocument(value.driver, 'node', 'chunked')).toThrow(NodeBodyUnavailableError);
  value.sqlite.exec(`INSERT INTO nodes (id,kind,title,content,created_at,updated_at)
    VALUES ('folder','folder','Folder','','now','now')`);
  expect(loadWorkspaceNodeDocument(value.driver, 'folder', 'chunked'))
    .toEqual(loadWorkspaceNodeDocument(value.driver, 'folder'));
});

it('reads current and selected alternative bodies with the same preview and selection semantics', async () => {
  const value = host();
  value.insert('node', '\uFEFFCurrent 中文\0😀');
  const hash = upsertTextBodyBlob(value.driver, 'Alternative 中😀'.repeat(200_000), 'now');
  const alternative = { id: 'alternative', body_blob_hash: hash, source_host_name: 'other',
    created_at: '2026-10-07T00:00:00Z', expires_at: '2099-10-07T00:00:00Z' };
  value.sqlite.prepare(`INSERT INTO node_sync_versions
    (version_id,object_id,host_name,created_at,content_hash,snapshot_json)
    VALUES ('version','node','host','now','identity',?)`).run(JSON.stringify({ text_alternatives: [alternative] }));
  value.sqlite.exec("UPDATE nodes SET current_version_id = 'version' WHERE id = 'node'");
  const expected = loadNodeTextAlternativePreviewWithDriver(value.driver, 'node', 'alternative')!;
  const expectedBody = loadTopicTextBodiesWithDriver(value.driver, [alternative]);
  await migrateBodyContentStorage(value.db);
  value.sqlite.exec('DROP TABLE content_blob_data');
  const reads = observeDriver(value.driver);
  const actual = loadNodeTextAlternativePreviewWithDriver(reads.driver, 'node', 'alternative', 'chunked')!;
  expect({ ...actual, checked_at: expected.checked_at }).toEqual(expected);
  expect(loadTopicTextBodiesWithDriver(reads.driver, [alternative], 'chunked')).toEqual(expectedBody);
  expect(loadNodeTextAlternativePreviewWithDriver(value.driver, 'node', 'unknown', 'chunked')?.alternative_id).toBe('alternative');
  expect(Math.max(...reads.sizes)).toBeLessThanOrEqual(512 * 1024);
  value.sqlite.prepare('DELETE FROM content_bodies WHERE hash = ?').run(hash);
  expect(() => loadTopicTextBodiesWithDriver(value.driver, [alternative], 'chunked'))
    .toThrow('text_alternative_body_unavailable:alternative');
});
