// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';

import { initializeDatabaseSchema } from './migrations.js';
import { loadNodeSourceDetails } from './nodeSourceDetails.js';
import { hashTextBody } from './textBodyHash.js';
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
    const hash = hashTextBody(body);
    sqlite.prepare(`INSERT INTO nodes (id,kind,title,content,body_blob_hash,parent_id,created_at,updated_at)
      VALUES (?, ?, 'Title', ?, ?, ?, 'now', 'now')`).run(id, kind, body, hash, parent);
    return hash;
  };
  return { sqlite, driver, insert };
}

it('preserves opened documents, inherited source and full snapshots without shared text storage', () => {
  const value = host();
  const bodies = ['', '  ', '\uFEFF中文\0😀', '中😀'.repeat(140_000)];
  bodies.forEach((body, index) => value.insert(`node-${index}`, body));
  value.insert('child', '', 'topic', 'node-3');
  value.sqlite.exec("UPDATE nodes SET anchor_link = '{}' WHERE id = 'child'");
  value.sqlite.exec(`INSERT INTO nodes (id,kind,title,content,created_at,updated_at)
    VALUES ('folder','folder','Folder','','now','now')`);
  const documents = [...bodies.map((_, index) => `node-${index}`), 'folder'].map((id) =>
    ({ id, document: loadWorkspaceNodeDocument(value.driver, id), source: loadNodeSourceDetails(value.driver, id) }));
  const inherited = loadNodeSourceDetails(value.driver, 'child');
  const snapshot = loadWorkspaceSnapshot(value.driver, { includeBody: true });
  value.sqlite.exec('DROP TABLE content_blob_data');
  for (const expected of documents) {
    expect(loadWorkspaceNodeDocument(value.driver, expected.id)).toEqual(expected.document);
    expect(loadNodeSourceDetails(value.driver, expected.id, 6)).toEqual(expected.source);
  }
  expect(loadNodeSourceDetails(value.driver, 'child', 6)).toEqual(inherited);
  expect(loadWorkspaceSnapshot(value.driver, { includeBody: true })).toEqual(snapshot);
  expect(loadWorkspaceNodeDocument(value.driver, 'missing')).toBeNull();
  expect(loadNodeSourceDetails(value.driver, 'missing', 6)).toBeNull();
});

it('keeps list hydration metadata-only while full reads retain exact current text', () => {
  const value = host();
  value.insert('node', '\ufeff中😀\0end');
  value.sqlite.exec('DROP TABLE content_blob_data');
  expect(loadWorkspaceSnapshot(value.driver)?.nodesById.node).toMatchObject({
    content: '', bodyBlobHash: hashTextBody('\ufeff中😀\0end')
  });
  expect(loadWorkspaceNodeDocument(value.driver, 'node')).toMatchObject({ content: '\ufeff中😀\0end' });
  expect(loadNodeSourceDetails(value.driver, 'node')).toMatchObject({
    sourceNodeContent: '\ufeff中😀\0end', sourceNodeBodyStatus: 'resolved'
  });
});
