// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { selectFramedSyncObjectStateFact } from '../../lib/core/sync/framedSyncObjectStateFact.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { folderDeletedAt, seedRetiredExternalDocuments } from './retiredExternalDocuments.testSupport.js';

it('repairs proved retired projections once and makes every legacy child selectable as a deletion fact', async () => {
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    seedRetiredExternalDocuments(sqlite, 562);
    upsertTextBodyBlob(createBetterSqlite3Driver(sqlite), 'Protected original body', folderDeletedAt);
    sqlite.exec(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
      VALUES ('imported-topic', 'topic', 'Imported topic', 'Independent imported body', 'now', 'now')`);
    const protectedBefore = protectedRows(sqlite);
    const port = createBetterSqliteDbPort(sqlite);
    const [first] = await readFramedSyncInventory(port);
    await expect(selectFramedSyncObjectStateFact(port, first!, first!.stateFactIds![0]!))
      .rejects.toThrow('framed_sync_source_changed');
    initializeDatabaseSchema(sqlite);
    const states = sqlite.prepare(`SELECT * FROM sync_object_state WHERE object_type = 'external_document'`).all();
    expect(states).toHaveLength(562);
    expect(states[0]).toMatchObject({ base_content_hash: 'original-base', sync_dirty: 1,
      deleted_at: folderDeletedAt, updated_at: folderDeletedAt, last_modified_by_host_name: 'Original host',
      content_hash: computeSyncContentHash('external_document', buildCanonicalSyncTombstone('retired-folder:document-0.md')) });
    for (const entry of await readFramedSyncInventory(port)) await expect(selectFramedSyncObjectStateFact(
      port, entry, entry.stateFactIds![0]!
    )).resolves.toMatchObject({ globalId: entry.globalId });
    initializeDatabaseSchema(sqlite);
    expect(sqlite.prepare(`SELECT * FROM sync_object_state WHERE object_type = 'external_document'`).all()).toEqual(states);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
    expect(protectedRows(sqlite)).toEqual(protectedBefore);
  } finally { sqlite.close(); }
});

it('preserves materialized documents, existing deletion facts, and ambiguous folder identities', () => {
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    seedRetiredExternalDocuments(sqlite, 3);
    sqlite.exec(`INSERT INTO external_documents
      (document_id, folder_id, relative_path, file_name, extension, source_size_bytes, source_modified_at,
       source_modified_ms, content_hash, title, content, indexed_at, created_at, updated_at)
      VALUES ('retired-folder:document-0.md', 'retired-folder', 'document-0.md', 'document-0.md',
        'md', 1, 'now', 1, 'hash', 'Document', 'Original projection', 'now', 'now', 'now');
      UPDATE sync_object_state SET deleted_at = '2026-07-02T00:00:00.000Z'
        WHERE object_id = 'retired-folder:document-1.md';
      UPDATE sync_object_state SET object_id = 'retired-folder:child:document-2.md'
        WHERE object_id = 'retired-folder:document-2.md';
      INSERT INTO sync_object_state
        (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
        VALUES ('external_folder', 'retired-folder:child', 900, 'other-folder', 'Host', 'now')`);
    const before = sqlite.prepare('SELECT * FROM sync_object_state ORDER BY object_id').all();
    initializeDatabaseSchema(sqlite);
    expect(sqlite.prepare('SELECT * FROM sync_object_state ORDER BY object_id').all()).toEqual(before);
    expect(sqlite.prepare('SELECT content FROM external_documents').pluck().get()).toBe('Original projection');
  } finally { sqlite.close(); }
});

function protectedRows(sqlite: Database.Database) {
  return { nodes: sqlite.prepare('SELECT * FROM nodes').all(),
    blobs: sqlite.prepare('SELECT * FROM content_blobs').all(), data: sqlite.prepare('SELECT * FROM content_blob_data').all() };
}

it('keeps unproved missing states and newer child facts unchanged', () => {
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    seedRetiredExternalDocuments(sqlite);
    sqlite.exec(`UPDATE sync_object_state SET updated_at = '2026-08-01T00:00:00.000Z'
      WHERE object_id = 'retired-folder:document-0.md';
      UPDATE sync_object_state SET object_id = 'unknown-folder:document-1.md'
      WHERE object_id = 'retired-folder:document-1.md'`);
    const before = sqlite.prepare('SELECT * FROM sync_object_state ORDER BY object_id').all();
    initializeDatabaseSchema(sqlite);
    expect(sqlite.prepare('SELECT * FROM sync_object_state ORDER BY object_id').all()).toEqual(before);
  } finally { sqlite.close(); }
});

it('rolls back repaired states and the schema version if migration publication fails', () => {
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    seedRetiredExternalDocuments(sqlite);
    const before = sqlite.prepare('SELECT * FROM sync_object_state ORDER BY object_id').all();
    sqlite.exec(`CREATE TRIGGER reject_retirement BEFORE UPDATE ON sync_object_state
      WHEN NEW.object_id = 'retired-folder:document-1.md'
      BEGIN SELECT RAISE(ABORT, 'retirement_rejected'); END`);
    expect(() => initializeDatabaseSchema(sqlite)).toThrow('retirement_rejected');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(142);
    expect(sqlite.prepare('SELECT * FROM sync_object_state ORDER BY object_id').all()).toEqual(before);
    sqlite.exec('DROP TRIGGER reject_retirement');
    initializeDatabaseSchema(sqlite);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  } finally { sqlite.close(); }
});
