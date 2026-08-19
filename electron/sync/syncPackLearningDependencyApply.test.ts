// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-learning-dependency-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-learning-dependency-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  installSyncPushAckTable();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('applies learning state after the pack applies its node row', async () => {
  const packPath = path.join(tempRoot, 'incoming-learning-dependency.db');
  createIncomingLearningDependencyPack(packPath);
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-learning-dependency-test' });

  await port.run(`ATTACH DATABASE '${packPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0,
      hostName: 'android-device'
    })).resolves.toMatchObject({
      applied: true,
      appliedObjectCount: 2,
      fromStateSeq: 0,
      toStateSeq: 2
    });
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  expect(connection.sqlite.prepare('SELECT title FROM nodes WHERE id = ?').get('node-reading-1')).toEqual({
    title: 'Reading Dependency'
  });
  expect(connection.sqlite.prepare(
    'SELECT state, interval_duration_ms FROM node_reading WHERE node_id = ?'
  ).get('node-reading-1')).toEqual({
    interval_duration_ms: 120000,
    state: 'active'
  });
});

it('removes learning state when the pack deletes its node row', async () => {
  const packPath = path.join(tempRoot, 'incoming-learning-delete-dependency.db');
  createIncomingDeletedNodePack(packPath);
  const connection = openDatabaseConnection();
  connection.sqlite.prepare(
    `INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at, deleted_at)
     VALUES (?, NULL, 'topic', 'Deleted later', '', ?, ?, NULL)`
  ).run('node-deleted-1', '2026-05-04T01:00:00.000Z', '2026-05-04T01:00:00.000Z');
  connection.sqlite.prepare(
    `INSERT INTO node_reading (
       node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at, priority, repetition_count, state
     ) VALUES (?, 60000, 1, ?, ?, 0, 1, 'active')`
  ).run('node-deleted-1', '2026-05-04T01:00:00.000Z', '2026-05-04T01:00:00.000Z');
  connection.sqlite.prepare(
    `INSERT INTO node_review (
       node_id, due, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses
     ) VALUES (?, ?, 1, 1, 1, 0, 1, 1, 0)`
  ).run('node-deleted-1', '2026-05-04T01:00:00.000Z');
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-learning-delete-dependency-test' });

  await port.run(`ATTACH DATABASE '${packPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0,
      hostName: 'android-device'
    })).resolves.toMatchObject({
      applied: true,
      appliedObjectCount: 1,
      fromStateSeq: 0,
      toStateSeq: 1
    });
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  expect(connection.sqlite.prepare('SELECT deleted_at FROM nodes WHERE id = ?').get('node-deleted-1')).toEqual({
    deleted_at: '2026-05-04T02:00:00.000Z'
  });
  expect(connection.sqlite.prepare('SELECT node_id FROM node_reading WHERE node_id = ?').get('node-deleted-1')).toBeUndefined();
  expect(connection.sqlite.prepare('SELECT node_id FROM node_review WHERE node_id = ?').get('node-deleted-1')).toBeUndefined();
});

function createIncomingLearningDependencyPack(filePath: string) {
  const db = new Database(filePath);
  try {
    for (const statement of PACK_SCHEMA) db.exec(statement);
    db.prepare('INSERT INTO pack_manifest (key, value) VALUES (?, ?)').run(
      'manifest_json',
      JSON.stringify({ from_state_seq: 0, to_state_seq: 2 })
    );
    db.prepare(
      `INSERT INTO sync_object_state (
         object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at
       ) VALUES ('node', 'node-reading-1', 1, 'node-reading-hash-1', 'desktop-host', '2026-05-04T01:59:00.000Z', NULL)`
    ).run();
    db.prepare(
      `INSERT INTO sync_object_state (
         object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at
       ) VALUES ('node_reading', 'node-reading-1', 2, 'reading-hash-1', 'desktop-host', '2026-05-04T02:00:00.000Z', NULL)`
    ).run();
    db.prepare(
      `INSERT INTO sync_objects (object_type, object_id, content_hash, payload_json, updated_at, deleted_at)
       VALUES ('node_reading', 'node-reading-1', 'reading-hash-1', ?, '2026-05-04T02:00:00.000Z', NULL)`
    ).run(JSON.stringify({
      interval_duration_ms: 120000,
      interval_growth_factor: 1.5,
      last_handled_at: '2026-05-04T02:00:00.000Z',
      next_at: '2026-05-05T02:00:00.000Z',
      priority: 0.5,
      reading_position: 42,
      repetition_count: 2,
      state: 'active'
    }));
    db.prepare(
      `INSERT INTO nodes (
         id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash,
         opening_text, content, current_version_id, created_at, updated_at, deleted_at
       ) VALUES (?, ?, 'topic', 'Reading Dependency', 0, 0, NULL, NULL, '', ?, ?, ?, NULL)`
    ).run(
      'node-reading-1',
      null,
      'desktop#reading-1',
      '2026-05-04T01:59:00.000Z',
      '2026-05-04T01:59:00.000Z'
    );
    db.prepare(
      `INSERT INTO node_sync_versions (
         version_id, object_id, parent_version_id, host_name, created_at, content_hash, snapshot_json
       ) VALUES (?, ?, NULL, ?, ?, ?, ?)`
    ).run(
      'desktop#reading-1',
      'node-reading-1',
      'desktop',
      '2026-05-04T01:59:00.000Z',
      'node-reading-hash-1',
      JSON.stringify({ id: 'node-reading-1', title: 'Reading Dependency' })
    );
  } finally {
    db.close();
  }
}

function createIncomingDeletedNodePack(filePath: string) {
  const db = new Database(filePath);
  try {
    for (const statement of PACK_SCHEMA) db.exec(statement);
    db.prepare('INSERT INTO pack_manifest (key, value) VALUES (?, ?)').run(
      'manifest_json',
      JSON.stringify({ from_state_seq: 0, to_state_seq: 1 })
    );
    db.prepare(
      `INSERT INTO sync_object_state (
         object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at
       ) VALUES ('node', 'node-deleted-1', 1, 'node-deleted-hash-1', 'desktop-host',
         '2026-05-04T02:00:00.000Z', '2026-05-04T02:00:00.000Z')`
    ).run();
    db.prepare(
      `INSERT INTO nodes (
         id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash,
         opening_text, content, current_version_id, created_at, updated_at, deleted_at
       ) VALUES (?, ?, 'topic', 'Deleted later', 0, 0, NULL, NULL, '', ?, ?, ?, ?)`
    ).run(
      'node-deleted-1',
      null,
      'desktop#deleted-1',
      '2026-05-04T01:00:00.000Z',
      '2026-05-04T02:00:00.000Z',
      '2026-05-04T02:00:00.000Z'
    );
    db.prepare(
      `INSERT INTO node_sync_versions (
         version_id, object_id, parent_version_id, host_name, created_at, content_hash, snapshot_json
       ) VALUES (?, ?, NULL, ?, ?, ?, ?)`
    ).run(
      'desktop#deleted-1',
      'node-deleted-1',
      'desktop',
      '2026-05-04T02:00:00.000Z',
      'node-deleted-hash-1',
      JSON.stringify({ deleted_at: '2026-05-04T02:00:00.000Z', id: 'node-deleted-1' })
    );
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
