// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-node-parent-order-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-node-parent-order-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  incomingPath = path.join(tempRoot, 'incoming.db');
  initializeDatabaseConnection(openDatabaseConnection());
  installSyncPushAckTable();
  createIncomingPack(incomingPath);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('applies parent nodes before children when the pack rows arrive child-first', async () => {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-node-parent-order-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodesWithDbPort(port);
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  expect(connection.sqlite.prepare(
    `SELECT id, parent_id, title FROM nodes ORDER BY id ASC`
  ).all()).toEqual([
    { id: 'child-1', parent_id: 'parent-1', title: 'Child Node' },
    { id: 'parent-1', parent_id: null, title: 'Parent Node' }
  ]);
});

function createIncomingPack(filePath: string) {
  const db = new Database(filePath);
  try {
    for (const statement of PACK_SCHEMA) db.exec(statement);
    db.prepare(
      `INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash, updated_at, deleted_at)
       VALUES
         ('node', 'child-1', 1, 'child-hash', '2026-05-29T07:48:00.000Z', NULL),
         ('node', 'parent-1', 2, 'parent-hash', '2026-05-29T07:47:00.000Z', NULL)`
    ).run();
    db.prepare(
      `INSERT INTO nodes (
         id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash,
         opening_text, content, current_version_id, created_at, updated_at, deleted_at
       ) VALUES
         ('child-1', 'parent-1', 'topic', 'Child Node', 0, 0, NULL, NULL, '', 'desktop#child',
          '2026-05-29T07:48:00.000Z', '2026-05-29T07:48:00.000Z', NULL),
         ('parent-1', NULL, 'folder', 'Parent Node', 0, 0, NULL, NULL, '', 'desktop#parent',
          '2026-05-29T07:47:00.000Z', '2026-05-29T07:47:00.000Z', NULL)`
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
