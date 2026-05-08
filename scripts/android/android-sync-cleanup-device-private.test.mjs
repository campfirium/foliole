// @vitest-environment node
import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupDevicePrivateResidue,
  formatCleanupReport,
  parseArgs
} from './android-sync-cleanup-device-private.mjs';

let tempDir = '';

describe('android device-private sync cleanup', () => {
  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = '';
  });

  it('reports residue without deleting by default', async () => {
    const dbPath = await createSeededDatabase();

    const report = cleanupDevicePrivateResidue(dbPath);

    expect(report.applied).toBe(false);
    expect(report.nodeViewState).toHaveLength(1);
    expect(report.nodeReadingDeviceState).toHaveLength(1);
    expect(report.viewStateSyncObjects).toHaveLength(2);
    expect(report.syncPushAcks).toHaveLength(1);
    expect(countRows(dbPath, 'node_view_state')).toBe(2);
    expect(formatCleanupReport(report)).toContain('applied=no');
  });

  it('requires destructive apply before deleting non-local device-private rows', async () => {
    const dbPath = await createSeededDatabase();

    const readOnly = cleanupDevicePrivateResidue(dbPath, { apply: true, destructive: false });
    expect(readOnly.applied).toBe(false);
    expect(countRows(dbPath, 'node_reading_device_state')).toBe(2);

    const applied = cleanupDevicePrivateResidue(dbPath, { apply: true, destructive: true });
    expect(applied.applied).toBe(true);
    expect(applied.nodeViewState).toHaveLength(0);
    expect(applied.nodeReadingDeviceState).toHaveLength(0);
    expect(applied.viewStateSyncObjects).toHaveLength(0);
    expect(applied.syncPushAcks).toHaveLength(0);
    expect(countRows(dbPath, 'node_view_state')).toBe(1);
    expect(countRows(dbPath, 'node_reading_device_state')).toBe(1);
    expect(countRows(dbPath, 'sync_object_state')).toBe(0);
    expect(countRows(dbPath, 'sync_push_ack')).toBe(0);
  });

  it('parses database and destructive flags', () => {
    expect(parseArgs(['--db', '/tmp/android.db', '--apply', '--destructive'])).toEqual({
      apply: true,
      databasePath: '/tmp/android.db',
      destructive: true
    });
  });
});

async function createSeededDatabase() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'android-device-private-cleanup-'));
  const dbPath = path.join(tempDir, 'android.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE node_view_state (node_id TEXT, device_id TEXT, scroll_top INTEGER);
    CREATE TABLE node_reading_device_state (node_id TEXT, device_id TEXT, reading_position INTEGER);
    CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT);
    CREATE TABLE sync_push_ack (object_type TEXT, object_id TEXT);
  `);
  db.prepare('INSERT INTO companion_meta VALUES (?, ?)').run('device_id', 'android-local');
  db.prepare('INSERT INTO node_view_state VALUES (?, ?, ?)').run('node-1', 'android-local', 10);
  db.prepare('INSERT INTO node_view_state VALUES (?, ?, ?)').run('node-2', 'other-device', 20);
  db.prepare('INSERT INTO node_reading_device_state VALUES (?, ?, ?)').run('node-1', 'android-local', 10);
  db.prepare('INSERT INTO node_reading_device_state VALUES (?, ?, ?)').run('node-2', 'other-device', 20);
  db.prepare('INSERT INTO sync_object_state VALUES (?, ?)').run('view_state', 'session_resume:android:phone:android-local:active_node');
  db.prepare('INSERT INTO sync_object_state VALUES (?, ?)').run('view_state', 'session_resume:android:phone:other-device:active_node');
  db.prepare('INSERT INTO sync_push_ack VALUES (?, ?)').run('view_state', 'session_resume:android:phone:android-local:active_node');
  db.close();
  return dbPath;
}

function countRows(dbPath, table) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  } finally {
    db.close();
  }
}
