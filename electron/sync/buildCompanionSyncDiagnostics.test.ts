// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { SPECIAL_ROOT_NODE_IDS } from '../../lib/core/database/nodeMutationSpecialRoots.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';

const state = vi.hoisted(() => {
  let driver: DatabaseDriver;
  return { getDriver: () => driver, setDriver: (value: DatabaseDriver) => { driver = value; } };
});
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ driver: state.getDriver(), dbPath: 'temporary-diagnostics.db' })
}));
vi.mock('../database/deviceIdentity.js', () => ({ loadOrCreateDesktopDeviceId: () => 'test-device' }));

import { buildCompanionSyncDiagnostics } from './buildCompanionSyncDiagnostics.js';

let root = '';
let sqlite: Database.Database;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-diagnostics-'));
  sqlite = new Database(path.join(root, 'foliole.db'));
  state.setDriver(createBetterSqlite3Driver(sqlite));
  sqlite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, current_version_id TEXT, deleted_at TEXT, body_blob_hash TEXT,
    content TEXT NOT NULL DEFAULT '');
    CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, sync_dirty INTEGER, state_seq INTEGER);
    CREATE TABLE content_blobs (hash TEXT);
    CREATE TABLE external_documents (id TEXT);
    CREATE TABLE sync_state_sequence (singleton_id INTEGER, high_water INTEGER);
    CREATE TABLE settings (key TEXT, value TEXT);`);
  sqlite.prepare('INSERT INTO sync_state_sequence VALUES (1, 1)').run();
  for (const id of SPECIAL_ROOT_NODE_IDS) sqlite.prepare('INSERT INTO nodes (id) VALUES (?)').run(id);
});
afterEach(async () => { sqlite.close(); await fs.rm(root, { recursive: true, force: true }); });

it.each([false, true])('does not report normal system roots as incomplete topics, historicalRows=%s', historicalRows => {
  if (historicalRows) {
    for (const id of SPECIAL_ROOT_NODE_IDS) {
      sqlite.prepare('UPDATE nodes SET current_version_id = ? WHERE id = ?').run('historical-version', id);
      sqlite.prepare("INSERT INTO sync_object_state VALUES ('node', ?, 0, 1)").run(id);
    }
  }
  const result = buildCompanionSyncDiagnostics({ appVersion: 'test', serverStatus: null });
  expect(result.storage.missing_node_state_count).toBe(0);
  expect(result.storage.missing_node_version_count).toBe(0);
  expect(result.verdicts.map(item => item.code)).not.toContain('desktop_has_nodes_missing_state_rows');
  expect(result.verdicts.map(item => item.code)).not.toContain('desktop_has_nodes_missing_versions');
});

it('still reports ordinary topics missing sync state and versions', () => {
  sqlite.prepare('INSERT INTO nodes (id) VALUES (?)').run('ordinary-topic');
  const result = buildCompanionSyncDiagnostics({ appVersion: 'test', serverStatus: null });
  expect(result.storage.missing_node_state_count).toBe(1);
  expect(result.storage.missing_node_version_count).toBe(1);
  expect(result.verdicts.map(item => item.code)).toContain('desktop_has_nodes_missing_state_rows');
  expect(result.verdicts.map(item => item.code)).toContain('desktop_has_nodes_missing_versions');
});

it.each(['Current body', ''])('does not treat retired blob references as missing current topic content: %j', content => {
  sqlite.prepare('INSERT INTO nodes (id, current_version_id, body_blob_hash, content) VALUES (?, ?, ?, ?)')
    .run('topic', 'version', 'retired-blob', content);
  sqlite.prepare("INSERT INTO sync_object_state VALUES ('node', 'topic', 0, 1)").run();
  const result = buildCompanionSyncDiagnostics({ appVersion: 'test', serverStatus: null });
  expect(result.storage.node_blob_references_missing_rows).toBe(1);
  expect(result.content.missing_content_blob_count).toBe(0);
  expect(result.content.missing_topic_body_count).toBe(0);
  expect(result.verdicts.map(item => item.code)).not.toContain('desktop_has_node_blob_references_missing_rows');
});
