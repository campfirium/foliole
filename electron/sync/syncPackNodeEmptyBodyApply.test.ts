// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-empty-version-body-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { applySyncPackNodesWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { applySyncPackNodeVersionsWithDbPort } from '../../lib/core/sync/syncPackNodeVersionApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import { createIncomingPack, installLocalNodeFixtures } from './syncPackNodeApplyTestSupport.js';

let incomingPath = '';
let tempRoot = '';

function insertLocalNode() {
  openDatabaseConnection().sqlite.prepare(`INSERT INTO nodes
    (id, kind, title, content, created_at, updated_at)
    VALUES ('node-1', 'topic', 'Local Node', '', '2026-05-04T00:00:00.000Z',
      '2026-05-04T00:00:00.000Z')`).run();
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-empty-version-body-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  incomingPath = path.join(tempRoot, 'incoming.db');
  initializeDatabaseConnection(openDatabaseConnection());
  installLocalNodeFixtures();
  createIncomingPack(incomingPath);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('accepts an empty version body as valid topic text', async () => {
  const incoming = new Database(incomingPath);
  try {
    incoming.prepare('UPDATE node_sync_versions SET body_text = ? WHERE version_id = ?')
      .run('', 'desktop#1');
  } finally {
    incoming.close();
  }
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-empty-version-body-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodesWithDbPort(port)).resolves.toBeUndefined();
  } finally {
    await port.run('DETACH DATABASE inc');
  }
  expect(connection.sqlite.prepare(
    'SELECT body_text FROM node_sync_versions WHERE version_id = ?'
  ).get('desktop#1')).toEqual({ body_text: '' });
});

it('imports lightweight ancestry and rehydrates a current version from a later full replay', async () => {
  const incoming = new Database(incomingPath);
  try {
    incoming.prepare('UPDATE node_sync_versions SET snapshot_json = ? WHERE version_id = ?')
      .run('{"id":"node-1","title":"Packed Node","content":null}', 'desktop#1');
  } finally {
    incoming.close();
  }
  const connection = openDatabaseConnection();
  insertLocalNode();
  const port = createBetterSqliteDbPort(connection.sqlite);
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodeVersionsWithDbPort(port);
    expect(connection.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?')
      .get('desktop#1')).toEqual({ body_text: null });

    const replay = new Database(incomingPath);
    try {
      replay.prepare('UPDATE node_sync_versions SET body_text = ?, snapshot_json = ? WHERE version_id = ?')
        .run('Packed answer', '{"id":"node-1","title":"Packed Node","content":"Packed answer"}', 'desktop#1');
    } finally {
      replay.close();
    }
    await applySyncPackNodeVersionsWithDbPort(port);
    expect(connection.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?')
      .get('desktop#1')).toEqual({ body_text: 'Packed answer' });
  } finally {
    await port.run('DETACH DATABASE inc');
  }
});

it('keeps a full local body when a replay only carries ancestry', async () => {
  const incoming = new Database(incomingPath);
  try {
    incoming.prepare('UPDATE node_sync_versions SET snapshot_json = ? WHERE version_id = ?')
      .run('{"id":"node-1","title":"Packed Node","content":null}', 'desktop#1');
  } finally {
    incoming.close();
  }
  const connection = openDatabaseConnection();
  insertLocalNode();
  connection.sqlite.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES ('desktop#1', 'node-1', NULL, 'desktop', '2026-05-04T01:00:00.000Z',
      'hash-node-1', 'Packed answer', '{"id":"node-1","title":"Packed Node","content":"Packed answer"}')`).run();
  const port = createBetterSqliteDbPort(connection.sqlite);
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodeVersionsWithDbPort(port);
  } finally {
    await port.run('DETACH DATABASE inc');
  }
  expect(connection.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?')
    .get('desktop#1')).toEqual({ body_text: 'Packed answer' });
});

it('restores a stripped common base supplied by a returning branch', async () => {
  const connection = openDatabaseConnection();
  insertLocalNode();
  connection.sqlite.exec(`
    UPDATE nodes SET current_version_id = 'local-head' WHERE id = 'node-1';
    INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES
      ('shared-base', 'node-1', NULL, 'desktop', '2026-05-04T01:00:00.000Z',
       'hash-base', NULL, '{"id":"node-1","content":null}'),
      ('local-head', 'node-1', 'shared-base', 'desktop', '2026-05-04T02:00:00.000Z',
       'hash-local', 'Local edit', '{"id":"node-1","content":"Local edit"}');
    INSERT INTO node_sync_version_parents VALUES ('local-head', 'shared-base', 0);
  `);
  const incoming = new Database(incomingPath);
  try {
    incoming.exec(`
      DELETE FROM node_sync_versions;
      UPDATE nodes SET current_version_id = 'returning-head' WHERE id = 'node-1';
      INSERT INTO node_sync_versions
        (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES
        ('shared-base', 'node-1', NULL, 'desktop', '2026-05-04T01:00:00.000Z',
         'hash-base', 'Original body', '{"id":"node-1","content":"Original body"}'),
        ('returning-head', 'node-1', 'shared-base', 'phone', '2026-05-04T03:00:00.000Z',
         'hash-returning', 'Offline edit', '{"id":"node-1","content":"Offline edit"}');
      INSERT INTO node_sync_version_parents VALUES ('returning-head', 'shared-base', 0);
    `);
  } finally {
    incoming.close();
  }
  const port = createBetterSqliteDbPort(connection.sqlite);
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodeVersionsWithDbPort(port);
  } finally {
    await port.run('DETACH DATABASE inc');
  }
  expect(connection.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?')
    .get('shared-base')).toEqual({ body_text: 'Original body' });
});
