// @vitest-environment node
import Database from 'better-sqlite3';
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
    CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, state_seq INTEGER, content_hash TEXT, deleted_at TEXT);
    CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT, body_blob_hash TEXT, deleted_at TEXT);
    CREATE TABLE node_order (node_id TEXT PRIMARY KEY, position INTEGER);
    CREATE TABLE external_documents (document_id TEXT PRIMARY KEY, body_blob_hash TEXT, is_present INTEGER);
    CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, availability TEXT);
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
  `);
  return { db, dbPath };
}

function insertState(db, objectType, objectId, seq) {
  db.prepare('INSERT INTO sync_object_state VALUES (?, ?, ?, ?, NULL)').run(objectType, objectId, seq, `${objectId}-hash`);
}

function seedDesktop(db) {
  db.prepare('INSERT INTO sync_object_state VALUES (?, ?, ?, ?, ?)').run('node', 'deleted-node', 2, 'deleted-hash', '2026-01-01');
  insertState(db, 'node', 'node-1', 5);
  insertState(db, 'node', 'node-2', 8);
  insertState(db, 'external_document', 'doc-1', 9);
  db.prepare('INSERT INTO nodes VALUES (?, ?, ?, NULL)').run('node-1', 'One', 'blob-1');
  db.prepare('INSERT INTO nodes VALUES (?, ?, ?, NULL)').run('node-2', 'Two', 'blob-2');
  db.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?)').run('deleted-node', 'Deleted', null, '2026-01-01');
  db.prepare('INSERT INTO node_order VALUES (?, ?)').run('node-1', 1);
  db.prepare('INSERT INTO node_order VALUES (?, ?)').run('node-2', 2);
  db.prepare('INSERT INTO external_documents VALUES (?, ?, ?)').run('doc-1', 'blob-doc', 1);
}

function seedAndroid(db) {
  db.prepare('INSERT INTO companion_meta VALUES (?, ?)').run('workspace_sync_endpoint_url', 'http://10.0.2.2:38641');
  db.prepare('INSERT INTO companion_meta VALUES (?, ?)').run('sync_pack_cursor', '10');
  insertState(db, 'node', 'node-1', 1);
  insertState(db, 'external_document', 'doc-1', 2);
  db.prepare('INSERT INTO nodes VALUES (?, ?, ?, NULL)').run('node-1', 'One', 'blob-1');
  db.prepare('INSERT INTO node_order VALUES (?, ?)').run('node-1', 1);
  db.prepare('INSERT INTO external_documents VALUES (?, ?, ?)').run('doc-1', 'blob-doc', 1);
  db.prepare('INSERT INTO content_blobs VALUES (?, ?)').run('blob-1', 'cached');
  db.prepare('INSERT INTO content_blobs VALUES (?, ?)').run('blob-doc', 'missing');
  db.prepare('INSERT INTO content_blobs VALUES (?, ?)').run('available-without-data', 'cached');
}

describe('android sync audit core', () => {
  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = '';
  });

  it('reports structural gaps and likely broken layer from sqlite snapshots', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'android-sync-audit-'));
    const desktop = createDatabase('desktop.db');
    const android = createDatabase('android.db');
    seedDesktop(desktop.db);
    seedAndroid(android.db);
    desktop.db.close();
    android.db.close();

    const report = auditDatabases(desktop.dbPath, android.dbPath, { serial: 'emulator-5554' });
    const output = formatAuditReport(report);

    expect(report.cursors).toMatchObject({ androidCursor: 10, desktopMaxSeq: 9, gap: -1 });
    expect(report.structural.find((item) => item.name === 'nodes')?.missingOnAndroid).toEqual(['node-2']);
    expect(report.structural.find((item) => item.name === 'node_order')?.missingOnAndroid).toEqual(['node-2']);
    expect(report.structural.find((item) => item.name === 'nodes')?.missingOnAndroid).not.toContain('deleted-node');
    expect(report.resources.availableWithoutData).toContain('blob-1');
    expect(report.suspectedBrokenLayer).toBe('cursor advancement: Android cursor is ahead of desktop');
    expect(output).toContain('=== Suspected Broken Layer ===');
  });
});
