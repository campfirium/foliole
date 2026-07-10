// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-node-full-projection-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-node-full-projection-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  incomingPath = path.join(tempRoot, 'incoming.db');
  initializeDatabaseConnection(openDatabaseConnection());
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
  createIncomingPack(incomingPath);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('applies all canonical pack fields to a new node', async () => {
  await applyIncomingPack();

  expect(readCanonicalFields()).toEqual({
    anchor_link: '{"id":"anchor-new"}',
    desired_retention: 0.91,
    enable_short_term: 0,
    image_regions: '[{"source":"pack"}]',
    manual_child_order: '["child-b","child-a"]',
    priority: 4,
    sequential_reading_enabled: 1,
    virtual_filter: '{"kind":"manual"}'
  });
});

it('treats explicit nulls from a current pack as authoritative for an existing node', async () => {
  insertExistingNode();
  const incoming = new Database(incomingPath);
  try {
    incoming.prepare(
      `UPDATE nodes SET priority = NULL, desired_retention = NULL, enable_short_term = NULL,
        sequential_reading_enabled = NULL, manual_child_order = NULL, virtual_filter = NULL,
        anchor_link = NULL, image_regions = NULL WHERE id = 'node-1'`
    ).run();
  } finally {
    incoming.close();
  }

  await applyIncomingPack();

  expect(readCanonicalFields()).toEqual({
    anchor_link: null,
    desired_retention: null,
    enable_short_term: null,
    image_regions: null,
    manual_child_order: null,
    priority: null,
    sequential_reading_enabled: null,
    virtual_filter: null
  });
});

async function applyIncomingPack() {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-node-full-projection-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodesWithDbPort(port);
  } finally {
    await port.run('DETACH DATABASE inc');
  }
}

function readCanonicalFields() {
  return openDatabaseConnection().sqlite.prepare(
    `SELECT priority, desired_retention, enable_short_term, sequential_reading_enabled,
            manual_child_order, virtual_filter, anchor_link, image_regions
     FROM nodes WHERE id = 'node-1'`
  ).get();
}

function createIncomingPack(filePath: string) {
  const db = new Database(filePath);
  try {
    for (const statement of PACK_SCHEMA) db.exec(statement);
    db.prepare(
      `INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash, updated_at, deleted_at)
       VALUES ('node', 'node-1', 1, 'node-hash', '2026-07-10T01:00:00.000Z', NULL)`
    ).run();
    db.prepare(
      `INSERT INTO nodes (
         id, kind, priority, desired_retention, enable_short_term, sequential_reading_enabled,
         manual_child_order, title, is_title_manual, hide_title_heading, content,
         virtual_filter, anchor_link, image_regions, created_at, updated_at
       ) VALUES ('node-1', 'folder', 4, 0.91, 0, 1, '["child-b","child-a"]',
         'Packed folder', 1, 0, '', '{"kind":"manual"}', '{"id":"anchor-new"}',
         '[{"source":"pack"}]', '2026-07-10T00:00:00.000Z', '2026-07-10T01:00:00.000Z')`
    ).run();
  } finally {
    db.close();
  }
}

function insertExistingNode() {
  openDatabaseConnection().sqlite.exec(`
    INSERT INTO nodes (
      id, kind, priority, desired_retention, enable_short_term, sequential_reading_enabled,
      manual_child_order, title, content, virtual_filter, anchor_link, image_regions, created_at, updated_at
    ) VALUES (
      'node-1', 'folder', 9, 0.5, 1, 0, '["old-child"]', 'Old folder', '',
      '{"kind":"old"}', '{"id":"anchor-old"}', '[{"source":"old"}]',
      '2026-07-09T00:00:00.000Z', '2026-07-09T01:00:00.000Z'
    )
  `);
}
