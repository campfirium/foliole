// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-node-field-preservation-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-node-field-preservation-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  incomingPath = path.join(tempRoot, 'incoming.db');
  initializeDatabaseConnection(openDatabaseConnection());
  installSyncPushAckTable();
  createIncomingPack(incomingPath);
  insertRestoredNode();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('preserves node fields that are not carried by the pack node table', async () => {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-node-preserve-fields-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodesWithDbPort(port);
    await applySyncPackNodesWithDbPort(port);
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  expect(connection.sqlite.prepare(
    `SELECT title, priority, reveal, image_regions, sequential_reading_enabled,
       import_source_fingerprint, import_content_fingerprint
     FROM nodes WHERE id = ?`
  ).get('node-1')).toEqual({
    image_regions: '[{"source":"restored"}]',
    import_content_fingerprint: 'content-restored',
    import_source_fingerprint: 'source-restored',
    priority: 3,
    reveal: 'Restored answer',
    sequential_reading_enabled: 1,
    title: 'Packed Node'
  });
});

it('uses nullable defaults when a legacy pack creates a new node', async () => {
  const connection = openDatabaseConnection();
  connection.sqlite.prepare('DELETE FROM nodes WHERE id = ?').run('node-1');
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-node-legacy-new-fields-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodesWithDbPort(port);
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  expect(connection.sqlite.prepare(
    `SELECT priority, desired_retention, enable_short_term, sequential_reading_enabled,
            manual_child_order, virtual_filter, anchor_link, image_regions,
            import_source_fingerprint, import_content_fingerprint
     FROM nodes WHERE id = ?`
  ).get('node-1')).toEqual({
    anchor_link: null,
    desired_retention: null,
    enable_short_term: null,
    image_regions: null,
    import_content_fingerprint: null,
    import_source_fingerprint: null,
    manual_child_order: null,
    priority: null,
    sequential_reading_enabled: null,
    virtual_filter: null
  });
});

function createIncomingPack(filePath: string) {
  const db = new Database(filePath);
  try {
    for (const statement of legacyPackSchema()) db.exec(statement);
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
      `INSERT INTO node_sync_versions (
         version_id, object_id, parent_version_id, device_id, created_at, content_hash, snapshot_json
       ) VALUES ('desktop#1', 'node-1', NULL, 'desktop',
         '2026-05-04T01:00:00.000Z', 'hash-node-1', '{"id":"node-1","title":"Packed Node"}')`
    ).run();
  } finally {
    db.close();
  }
}

function legacyPackSchema() {
  const missingColumns = [
    'anchor_link',
    'desired_retention',
    'enable_short_term',
    'image_regions',
    'import_content_fingerprint',
    'import_source_fingerprint',
    'manual_child_order',
    'priority',
    'reveal',
    'sequential_reading_enabled',
    'virtual_filter'
  ];
  return PACK_SCHEMA.map((statement) => missingColumns.reduce(
    (result, column) => result.replace(new RegExp(`    ${column} [^\\n]+,\\n`), ''),
    statement
  ));
}

function insertRestoredNode() {
  openDatabaseConnection().sqlite.exec(`
    INSERT INTO nodes (
      id, parent_id, kind, priority, title, is_title_manual, hide_title_heading, content,
      reveal, image_regions, sequential_reading_enabled,
      import_source_fingerprint, import_content_fingerprint, created_at, updated_at
    ) VALUES (
      'node-1', NULL, 'topic', 3, 'Restored Node', 1, 1, 'Restored body',
      'Restored answer', '[{"source":"restored"}]', 1, 'source-restored', 'content-restored',
      '2026-05-04T00:00:00.000Z', '2026-05-04T00:30:00.000Z'
    );
    INSERT INTO sync_object_state (
      object_type, object_id, state_seq, current_version_id, content_hash,
      last_modified_by_device_id, updated_at, deleted_at, sync_dirty
    ) VALUES ('node', 'node-1', 1, 'android#local', 'hash-node-1', 'android-device',
      '2026-05-04T00:30:00.000Z', NULL, 0);
  `);
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
