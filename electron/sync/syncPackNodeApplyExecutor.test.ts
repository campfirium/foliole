// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-node-apply-tests';

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
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

let incomingPath = '';
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-node-apply-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  incomingPath = path.join(tempRoot, 'incoming.db');
  initializeDatabaseConnection(openDatabaseConnection());
  installSyncPushAckTable();
  insertAttachment();
  createIncomingPack(incomingPath);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('applies nodes and node attachments from an attached sync pack', async () => {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-node-apply-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodesWithDbPort(port);
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  expect(connection.sqlite.prepare('SELECT title, current_version_id FROM nodes WHERE id = ?').get('node-1')).toEqual({
    current_version_id: 'desktop#1',
    title: 'Packed Node'
  });
  expect(connection.sqlite.prepare('SELECT node_id, attachment_id, role FROM node_attachments').all()).toEqual([{
    attachment_id: 'att-1',
    node_id: 'node-1',
    role: 'reference'
  }]);
});

function createIncomingPack(filePath: string) {
  const db = new Database(filePath);
  try {
    for (const statement of PACK_SCHEMA) db.exec(statement);
    db.prepare(
      `INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash, updated_at, deleted_at)
       VALUES ('node', 'node-1', 1, 'hash-node-1', '2026-05-04T01:00:00.000Z', NULL)`
    ).run();
    db.prepare(
      `INSERT INTO nodes (
         id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash,
         opening_text, content, current_version_id, created_at, updated_at, deleted_at
       ) VALUES (?, NULL, 'topic', 'Packed Node', 0, 0, NULL, NULL, '', ?, ?, ?, NULL)`
    ).run('node-1', 'desktop#1', '2026-05-04T01:00:00.000Z', '2026-05-04T01:00:00.000Z');
    db.prepare(
      `INSERT INTO node_attachments (node_id, attachment_id, role)
       VALUES ('node-1', 'att-1', 'reference')`
    ).run();
  } finally {
    db.close();
  }
}

function installSyncPushAckTable() {
  openDatabaseConnection().sqlite.exec(`
    CREATE TABLE sync_push_ack (
      client_op_id TEXT PRIMARY KEY NOT NULL,
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      state_seq INTEGER,
      status TEXT NOT NULL,
      acked_at TEXT NOT NULL
    )
  `);
}

function insertAttachment() {
  openDatabaseConnection().sqlite.prepare(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES ('att-1', 'att-1.pdf', 'application/pdf', 128, '2026-05-04T00:00:00.000Z')`
  ).run();
}
