// @vitest-environment node
import Database from 'better-sqlite3';
import { Buffer } from 'node:buffer';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { auditDatabases, formatAuditReport } from './android-sync-audit-core.mjs';

let tempDir = '';

function createDatabase(name) {
  const dbPath = path.join(tempDir, name);
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE sync_object_state (
      object_type TEXT, object_id TEXT, state_seq INTEGER, content_hash TEXT, deleted_at TEXT, sync_dirty INTEGER DEFAULT 0
    );
    CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT, body_blob_hash TEXT, deleted_at TEXT);
    CREATE TABLE parent_child_order (parent_id TEXT PRIMARY KEY, child_ids_json TEXT);
    CREATE TABLE external_documents (document_id TEXT PRIMARY KEY, body_blob_hash TEXT, is_present INTEGER);
    CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, availability TEXT);
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
    CREATE TABLE attachment_blobs (attachment_id TEXT PRIMARY KEY, content_hash TEXT, availability TEXT);
    CREATE TABLE node_view_state (node_id TEXT, host_name TEXT, scroll_top INTEGER);
    CREATE TABLE node_reading_host_state (node_id TEXT, host_name TEXT, reading_position INTEGER, updated_at TEXT);
    CREATE TABLE review_log (id TEXT PRIMARY KEY, op_id TEXT UNIQUE);
  `);
  return { db, dbPath };
}

function insertState(db, objectType, objectId, seq) {
  db.prepare('INSERT INTO sync_object_state VALUES (?, ?, ?, ?, NULL, 0)').run(objectType, objectId, seq, `${objectId}-hash`);
}

function seedDesktop(db) {
  db.prepare('INSERT INTO sync_object_state VALUES (?, ?, ?, ?, ?, 0)').run('node', 'deleted-node', 2, 'deleted-hash', '2026-01-01');
  insertState(db, 'node', 'node-1', 5);
  insertState(db, 'node', 'node-2', 8);
  insertState(db, 'external_document', 'doc-1', 9);
  db.prepare('INSERT INTO nodes VALUES (?, ?, ?, NULL)').run('node-1', 'One', 'blob-1');
  db.prepare('INSERT INTO nodes VALUES (?, ?, ?, NULL)').run('node-2', 'Two', 'blob-2');
  db.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?)').run('deleted-node', 'Deleted', null, '2026-01-01');
  db.prepare('INSERT INTO parent_child_order VALUES (?, ?)').run('node-1', 1);
  db.prepare('INSERT INTO parent_child_order VALUES (?, ?)').run('node-2', 2);
  db.prepare('INSERT INTO external_documents VALUES (?, ?, ?)').run('doc-1', 'blob-doc', 1);
}

function seedAndroid(db) {
  db.prepare('INSERT INTO companion_meta VALUES (?, ?)').run('workspace_sync_endpoint_url', 'http://10.0.2.2:38641');
  insertState(db, 'node', 'node-1', 1);
  insertState(db, 'external_document', 'doc-1', 2);
  db.prepare('INSERT INTO nodes VALUES (?, ?, ?, NULL)').run('node-1', 'One', 'blob-1');
  db.prepare('INSERT INTO parent_child_order VALUES (?, ?)').run('node-1', 1);
  db.prepare('INSERT INTO external_documents VALUES (?, ?, ?)').run('doc-1', 'blob-doc', 1);
  db.prepare('INSERT INTO content_blobs VALUES (?, ?)').run('blob-1', 'cached');
  db.prepare('INSERT INTO content_blobs VALUES (?, ?)').run('blob-doc', 'missing');
  db.prepare('INSERT INTO content_blobs VALUES (?, ?)').run('available-without-data', 'cached');
  db.prepare('INSERT INTO content_blobs VALUES (?, ?)').run('stale-unreferenced', 'missing');
  db.prepare('INSERT INTO attachment_blobs VALUES (?, ?, ?)').run('att-1', 'att-hash-1', 'missing');
  db.prepare('INSERT INTO companion_meta VALUES (?, ?)').run('host_name', 'android-test-device');
  db.prepare('INSERT INTO node_view_state VALUES (?, ?, ?)').run('node-1', 'android-test-device', 24);
  db.prepare('INSERT INTO node_view_state VALUES (?, ?, ?)').run('node-2', 'other-device', 36);
  db.prepare('INSERT INTO node_reading_host_state VALUES (?, ?, ?, ?)').run('node-1', 'other-device', 128, 'now');
}

function seedCachedContent(db) {
  for (const hash of ['blob-1', 'blob-2', 'blob-doc']) {
    db.prepare('INSERT INTO content_blobs VALUES (?, ?)').run(hash, 'cached');
    db.prepare('INSERT INTO content_blob_data VALUES (?, ?)').run(hash, Buffer.from('body'));
  }
}

describe('android sync audit core', () => {
  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = '';
  });

  it('reports structural gaps and likely broken layer from sqlite snapshots', { meta: { calibratedMs: 120_000 } }, async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'android-sync-audit-'));
    const desktop = createDatabase('desktop.db');
    const android = createDatabase('android.db');
    seedDesktop(desktop.db);
    seedAndroid(android.db);
    desktop.db.close();
    android.db.close();

    const report = auditDatabases(desktop.dbPath, android.dbPath, { serial: 'emulator-5554' });
    const output = formatAuditReport(report);

    expect(report).not.toHaveProperty('cursors');
    expect(report.localPush).not.toHaveProperty('issueCount');
    expect(report.structural.find((item) => item.name === 'nodes')?.missingOnAndroid).toEqual(['node-2']);
    expect(report.structural.find((item) => item.name === 'parent_child_order')?.missingOnAndroid).toEqual(['node-2']);
    expect(report.structural.find((item) => item.name === 'nodes')?.missingOnAndroid).not.toContain('deleted-node');
    expect(report.resources.availableWithoutData).toContain('blob-1');
    expect(report.resources.missingReferencedContentBlobs).toBe(2);
    expect(report.resources.missingAttachmentResources).toBeNull();
    expect(output).toContain('referenced content blobs missing bytes: 2');
    expect(output).toContain('unreferenced content_blob availability=missing: 1');
    expect(report.suspectedBrokenLayer).toBe('parent_child_order apply');
    expect(output).not.toContain('pending_live_changes');
    expect(output).not.toContain('pending_types');
    expect(output).toContain('local_dirty_changes');
    expect(output).toContain('=== State Policy ===');
    expect(output).toContain('node_view_state rows: 2 non_local=1');
    expect(output).toContain('node_reading_host_state rows: 1 non_local=1');
    expect(report.statePolicy.hostPrivate).toMatchObject({
      currentHostName: 'android-test-device',
      nonLocalNodeReadingHostStateRows: 1,
      nonLocalNodeViewStateRows: 1
    });
    expect(output).toContain('=== Suspected Broken Layer ===');
  });

  it('does not infer pending transfers or convergence from desktop sequence numbers', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'android-sync-audit-'));
    const desktop = createDatabase('desktop.db');
    const android = createDatabase('android.db');
    seedDesktop(desktop.db);
    seedDesktop(android.db);
    seedCachedContent(android.db);
    android.db.prepare('INSERT INTO companion_meta VALUES (?, ?)').run('workspace_sync_endpoint_url', 'http://10.0.2.2:38641');
    desktop.db.prepare('INSERT INTO sync_object_state VALUES (?, ?, ?, ?, ?, 0)').run('external_document', 'deleted-doc', 11, 'deleted-doc-hash', '2026-05-07');
    desktop.db.close();
    android.db.close();

    const report = auditDatabases(desktop.dbPath, android.dbPath);

    expect(report).not.toHaveProperty('cursors');
    expect(report.structural.every((item) => item.missingOnAndroid.length === 0)).toBe(true);
    expect(report.suspectedBrokenLayer).toBe('no obvious structural break');
  });

});
