// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-shared-core-migration-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { DATABASE_SCHEMA_VERSION, initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { NODE_KIND_MIGRATION_CANDIDATES_META_KEY } from '../../lib/core/nodes/nodeKind.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-shared-core-migration-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('initializes schema through the shared core entry', () => {
  const connection = initializeDatabaseConnection(openDatabaseConnection());

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);

  const tables = connection.sqlite
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name IN (
         'import_runs', 'import_sources', 'keep_import_items', 'mirror_articles', 'node_reading', 'nodes', 'settings', 'workspace_meta', 'node_view_state'
       )
       ORDER BY name ASC`
    )
    .all() as Array<{ name: string }>;

  expect(tables).toEqual([
    { name: 'import_runs' },
    { name: 'import_sources' },
    { name: 'keep_import_items' },
    { name: 'mirror_articles' },
    { name: 'node_reading' },
    { name: 'node_view_state' },
    { name: 'nodes' },
    { name: 'settings' },
    { name: 'workspace_meta' }
  ]);
});

it('migrates legacy attachment ids to content hashes and rewrites node references', () => {
  const connection = openDatabaseConnection();

  connection.sqlite.exec(`
    CREATE TABLE attachments (
      id TEXT PRIMARY KEY,
      hash TEXT NOT NULL UNIQUE,
      original_name TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE node_attachments (
      node_id TEXT NOT NULL,
      attachment_id TEXT NOT NULL REFERENCES attachments(id),
      role TEXT NOT NULL,
      PRIMARY KEY (node_id, attachment_id, role)
    );
  `);

  connection.sqlite
    .prepare('INSERT INTO attachments (id, hash, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('attachment-legacy', 'hash-1', 'cover.png', 'image/png', 12, '2026-03-29T00:00:00.000Z');
  connection.sqlite.prepare('INSERT INTO nodes (id, content) VALUES (?, ?)').run(
    'node-1',
    '![Cover](attachment://attachment-legacy)\nSecond use: attachment://attachment-legacy'
  );
  connection.sqlite
    .prepare('INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)')
    .run('node-1', 'attachment-legacy', 'image');
  connection.sqlite.pragma('user_version = 10');

  initializeDatabaseConnection(connection);

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(
    connection.sqlite.prepare(`SELECT id, original_name, mime_type, size_bytes, created_at FROM attachments`).all()
  ).toEqual([
    {
      id: 'hash-1',
      original_name: 'cover.png',
      mime_type: 'image/png',
      size_bytes: 12,
      created_at: '2026-03-29T00:00:00.000Z'
    }
  ]);
  expect(connection.sqlite.prepare(`SELECT attachment_id, node_id, role FROM node_attachments`).all()).toEqual([
    {
      attachment_id: 'hash-1',
      node_id: 'node-1',
      role: 'image'
    }
  ]);
  expect(connection.sqlite.prepare(`SELECT content FROM nodes WHERE id = ?`).get('node-1')).toEqual({
    content: '![Cover](asset://hash-1.png)\nSecond use: asset://hash-1.png'
  });
  expect(
    (connection.sqlite.prepare(`PRAGMA table_info(attachments)`).all() as Array<{ name: string }>).map((column) => column.name)
  ).not.toContain('hash');
});

it('backfills node kind for legacy rows and records ambiguous empty leaf candidates', () => {
  const connection = openDatabaseConnection();

  connection.sqlite.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      title TEXT NOT NULL,
      is_title_manual INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL DEFAULT '',
      reveal TEXT,
      anchor_link TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE workspace_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const insertNode = connection.sqlite.prepare(
    `INSERT INTO nodes (id, parent_id, title, is_title_manual, content, reveal, anchor_link, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertNode.run('special-inbox', null, 'Inbox', 1, '', null, null, '2026-03-29T00:00:00.000Z', '2026-03-29T00:00:00.000Z', null);
  insertNode.run('node-folder', null, 'Folder shell', 1, '', null, null, '2026-03-29T00:00:00.000Z', '2026-03-29T00:00:00.000Z', null);
  insertNode.run('node-topic', 'node-folder', 'Topic body', 1, 'Body', null, null, '2026-03-29T00:00:00.000Z', '2026-03-29T00:00:00.000Z', null);
  insertNode.run('node-item', null, 'QA', 1, 'Prompt', 'Answer', null, '2026-03-29T00:00:00.000Z', '2026-03-29T00:00:00.000Z', null);
  insertNode.run('node-ambiguous', null, 'Blank draft', 1, '', null, null, '2026-03-29T00:00:00.000Z', '2026-03-29T00:00:00.000Z', null);
  connection.sqlite.pragma('user_version = 12');

  initializeDatabaseConnection(connection);

  expect(connection.sqlite.prepare(`SELECT id, kind FROM nodes ORDER BY id ASC`).all()).toEqual([
    { id: 'node-ambiguous', kind: 'topic' },
    { id: 'node-folder', kind: 'folder' },
    { id: 'node-item', kind: 'item' },
    { id: 'node-topic', kind: 'topic' },
    { id: 'special-inbox', kind: 'folder' }
  ]);

  const reportRow = connection.sqlite
    .prepare('SELECT value FROM workspace_meta WHERE key = ?')
    .get(NODE_KIND_MIGRATION_CANDIDATES_META_KEY) as { value: string };
  const report = JSON.parse(reportRow.value) as { candidates: Array<{ nodeId: string; fallbackKind: string }> };

  expect(report.candidates).toEqual([
    expect.objectContaining({ nodeId: 'node-ambiguous', fallbackKind: 'topic' })
  ]);
});
