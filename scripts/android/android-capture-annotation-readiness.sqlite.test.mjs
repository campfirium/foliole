// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';
import {
  captureAnnotationReadiness, inspectCaptureAnnotationWorkspace
} from './android-capture-annotation-readiness.mjs';

const databases = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function workspace({ body = 'Retained article body', deleted = null, blobs = 0, bodyBlobHash = null, blobBody = null } = {}) {
  const database = new DatabaseSync(':memory:');
  databases.push(database);
  database.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY, kind TEXT, content TEXT, deleted_at TEXT, body_blob_hash TEXT);
    CREATE TABLE parent_child_order (parent_id TEXT, child_id TEXT);
    CREATE TABLE content_blobs (hash TEXT);
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
    CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO nodes VALUES ('special-inbox', 'folder', NULL, NULL, NULL);
    INSERT INTO parent_child_order VALUES ('special-inbox', 'article');
    INSERT INTO companion_meta VALUES ('device_id', 'private-device');
    INSERT INTO companion_meta VALUES ('workspace_sync_endpoint_url', 'http://private-endpoint');
  `);
  database.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?, ?)').run('article', 'topic', body, deleted, bodyBlobHash);
  for (let index = 0; index < blobs; index += 1) {
    database.prepare('INSERT INTO content_blobs VALUES (?)').run(`unrelated-${index}`);
  }
  if (blobBody !== null) {
    database.prepare('INSERT INTO content_blob_data VALUES (?, ?)').run(bodyBlobHash, blobBody);
  }
  return database;
}

function readiness(database) {
  return captureAnnotationReadiness({ database: {
    exists: true, inspection: inspectCaptureAnnotationWorkspace(database)
  } });
}

it('accepts persisted canonical article text without legacy blob rows', () => {
  const database = workspace();
  expect(readiness(database)).toMatchObject({ resultStatus: 'ready', missingPrerequisites: [] });
  expect(JSON.stringify(readiness(database))).not.toMatch(/private-device|private-endpoint/u);
  expect(database.prepare('SELECT content FROM nodes WHERE id = ?').get('article').content)
    .toBe('Retained article body');
  expect(database.prepare('SELECT COUNT(*) AS count FROM content_blobs').get().count).toBe(0);
});

it.each([
  { body: null }, { body: '' }, { body: '   ' }, { deleted: '2026-11-01' }, { bodyBlobHash: 'missing', body: 'Stale inline preview' }
])('rejects a workspace without active readable text: %j', input => {
  const result = readiness(workspace({ ...input, blobs: 1 }));
  expect(result.resultStatus).toBe('approval_required');
  expect(result.missingPrerequisites).toContain('acceptance_workspace_empty');
});

it.each([
  ["DELETE FROM companion_meta WHERE key = 'device_id'", 'pairing_workspace_unproven'],
  ["DELETE FROM companion_meta WHERE key = 'workspace_sync_endpoint_url'", 'pairing_workspace_unproven'],
  ["UPDATE nodes SET deleted_at = '2026-11-01' WHERE id = 'special-inbox'", 'canonical_inbox_missing'],
  ['DELETE FROM parent_child_order', 'acceptance_workspace_empty']
])('preserves the existing protection for %s', (sql, missing) => {
  const database = workspace();
  database.exec(sql);
  const result = readiness(database);
  expect(result.resultStatus).toBe('approval_required');
  expect(result.missingPrerequisites).toContain(missing);
});

it('accepts a readable referenced body while ignoring its empty inline preview', () => {
  expect(readiness(workspace({ body: '', bodyBlobHash: 'body-hash', blobBody: 'Available body' })))
    .toMatchObject({ resultStatus: 'ready', missingPrerequisites: [] });
});
