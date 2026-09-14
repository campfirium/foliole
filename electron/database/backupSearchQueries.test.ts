// @vitest-environment node

import { createRequire } from 'node:module';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { findBackupSearchMatch, inspectBackupSearchSchema } from './backupSearchQueries.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let sqlite: import('better-sqlite3').Database;

beforeEach(() => {
  sqlite = new BetterSqlite3(':memory:');
  sqlite.exec(`
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL);
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      title TEXT,
      content TEXT,
      body_blob_hash TEXT,
      deleted_at TEXT
    );
    INSERT INTO nodes (id, parent_id, title, content, deleted_at)
      VALUES ('folder', NULL, 'Archive', '', NULL);
    INSERT INTO nodes (id, parent_id, title, content, deleted_at)
      VALUES ('body', 'folder', 'A body result', 'needle in inline body', NULL);
    INSERT INTO nodes (id, parent_id, title, content, deleted_at)
      VALUES ('title', 'folder', 'Needle title', 'ordinary body', '2026-09-01T00:00:00.000Z');
    INSERT INTO content_blob_data (hash, data) VALUES ('blob-hash', 'complete blob needle body');
    INSERT INTO nodes (id, parent_id, title, content, body_blob_hash, deleted_at)
      VALUES ('blob', 'folder', 'Blob result', '', 'blob-hash', NULL);
  `);
});

afterEach(() => sqlite.close());

it('searches title before inline and blob bodies while retaining deleted rows and paths', () => {
  const schema = inspectBackupSearchSchema(sqlite);
  const first = findBackupSearchMatch({
    backupName: 'manual-2026-09-10.db.gz', backupUpdatedAt: '2026-09-10T00:00:00.000Z', offset: 0, query: 'needle', schema, sqlite
  });
  const second = findBackupSearchMatch({
    backupName: 'manual-2026-09-10.db.gz', backupUpdatedAt: '2026-09-10T00:00:00.000Z', offset: 1, query: 'needle', schema, sqlite
  });
  const third = findBackupSearchMatch({
    backupName: 'manual-2026-09-10.db.gz', backupUpdatedAt: '2026-09-10T00:00:00.000Z', offset: 2, query: 'needle', schema, sqlite
  });

  expect(first).toMatchObject({
    backup_name: 'manual-2026-09-10.db.gz', content: 'ordinary body', deleted: true,
    node_id: 'title', path: 'Archive / Needle title', title: 'Needle title'
  });
  expect([second?.node_id, third?.node_id].sort()).toEqual(['blob', 'body']);
  expect(third?.content === 'complete blob needle body' || second?.content === 'complete blob needle body').toBe(true);
});

it('rejects backups without the minimum node body schema', () => {
  sqlite.exec('DROP TABLE nodes; CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT);');
  expect(() => inspectBackupSearchSchema(sqlite)).toThrow('nodes.content is missing');
});
