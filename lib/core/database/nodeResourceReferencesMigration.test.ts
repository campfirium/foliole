// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { parseNodeResourceReferences } from './nodeResourceReferences.js';
import { migrateNodeResourceReferences } from './nodeResourceReferencesMigration.js';

const pdf = 'a'.repeat(64);
const image = 'b'.repeat(64);

function fixture() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT, body_blob_hash TEXT);
    CREATE TABLE attachments (id TEXT PRIMARY KEY, mime_type TEXT, original_name TEXT);
    CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT, role TEXT);
    CREATE TABLE content_blobs (hash TEXT, compression TEXT);
    CREATE TABLE content_blob_data (hash TEXT, data BLOB);
    CREATE TABLE node_sync_versions (version_id TEXT, snapshot_json TEXT);
    INSERT INTO nodes VALUES ('article', '', NULL);
    INSERT INTO node_sync_versions VALUES ('old', '{"attachments":[]}');`);
  return db;
}

it('moves resource names to their nodes without changing historical snapshots or byte possession', () => {
  const db = fixture();
  try {
    db.prepare('INSERT INTO attachments VALUES (?, ?, ?)').run(pdf, 'application/pdf', 'Original.pdf');
    db.prepare('INSERT INTO attachments VALUES (?, ?, ?)').run(image, 'image/png', 'Original.png');
    db.prepare('INSERT INTO attachments VALUES (?, ?, ?)').run('c'.repeat(64), 'image/png', 'Unowned.png');
    db.prepare('INSERT INTO node_attachments VALUES (?, ?, ?)').run('article', pdf, 'reference');
    db.prepare('INSERT INTO node_attachments VALUES (?, ?, ?)').run('article', image, 'image');
    db.prepare('INSERT INTO node_attachments VALUES (?, ?, ?)').run('article', image, 'inline');
    db.prepare('INSERT INTO node_attachments VALUES (?, ?, ?)').run('article', image, 'cover');
    db.transaction(() => migrateNodeResourceReferences(db))();
    const row = db.prepare('SELECT resource_references FROM nodes').get() as { resource_references: string };
    expect(parseNodeResourceReferences(row.resource_references)).toEqual([
      { storage_key: `${pdf}.pdf`, role: 'reference', original_name: 'Original.pdf' },
      { storage_key: `${image}.png`, role: 'image', original_name: 'Original.png' }
    ]);
    expect(db.prepare('SELECT snapshot_json FROM node_sync_versions').get()).toEqual({ snapshot_json: '{"attachments":[]}' });
  } finally { db.close(); }
});

it('rolls back an unresolvable mounted resource instead of inventing its extension', () => {
  const db = fixture();
  try {
    db.prepare('INSERT INTO node_attachments VALUES (?, ?, ?)').run('article', pdf, 'reference');
    expect(() => db.transaction(() => migrateNodeResourceReferences(db))()).toThrow('node_resource_migration_unresolved');
    expect(db.prepare("SELECT name FROM pragma_table_info('nodes') WHERE name = 'resource_references'").all()).toEqual([]);
    expect(db.prepare('SELECT attachment_id FROM node_attachments').get()).toEqual({ attachment_id: pdf });
  } finally { db.close(); }
});
