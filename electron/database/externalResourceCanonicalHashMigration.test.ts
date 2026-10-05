// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import {
  buildCanonicalExternalDocumentPayload,
  buildCanonicalExternalFolderPayload
} from '../../lib/core/sync/canonicalExternalResourcePayload.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';

it('publishes legacy external resource hashes once without changing business clocks', () => {
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    seedResources(sqlite);
    sqlite.pragma('user_version = 136');
    initializeDatabaseSchema(sqlite);

    expect(readState(sqlite, 'external_document', 'doc-1')).toMatchObject({
      base_content_hash: 'legacy-document', content_hash: documentHash(), sync_dirty: 1, updated_at: 'business-time'
    });
    expect(readState(sqlite, 'external_folder', 'folder-1')).toMatchObject({
      base_content_hash: 'legacy-folder', content_hash: folderHash(), sync_dirty: 1, updated_at: 'business-time'
    });
    expect(readState(sqlite, 'external_document', 'deleted-doc')).toMatchObject({
      base_content_hash: 'legacy-delete', content_hash: computeSyncContentHash('external_document',
        buildCanonicalSyncTombstone('deleted-doc')), sync_dirty: 1, updated_at: 'business-time'
    });
    const published = sqlite.prepare(
      'SELECT object_type, object_id, state_seq, content_hash FROM sync_object_state ORDER BY object_id'
    ).all();
    initializeDatabaseSchema(sqlite);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
    expect(sqlite.prepare(
      'SELECT object_type, object_id, state_seq, content_hash FROM sync_object_state ORDER BY object_id'
    ).all()).toEqual(published);
  } finally { sqlite.close(); }
});

function seedResources(sqlite: Database.Database) {
  sqlite.exec(`
    INSERT INTO desktop_sources VALUES
      ('source-1','external','folder-1','Host','darwin','/private','posix','{}','business-time','business-time');
    INSERT INTO external_search_folders
      (id,folder_path,attachment_mode,attachment_root_path,excluded_dirs_json,status,document_count,
       indexed_at,last_error,created_at,updated_at,source_ref)
      VALUES ('folder-1','/private','document_relative',NULL,'[".git"]','ready',9,'cache-time','cache-error',
        'business-time','business-time','source-1');
    INSERT INTO external_documents
      (document_id,folder_id,relative_path,file_name,extension,source_size_bytes,source_modified_at,
       source_modified_ms,content_hash,title,body_blob_hash,content,reference_kind,reference_json,indexed_at,
       is_present,created_at,updated_at)
      VALUES ('doc-1','folder-1','doc.md','doc.md','md',99,'source-time',99,'body-hash','Doc',NULL,'',
        'local_path',NULL,'cache-time',1,'business-time','business-time');
  `);
  insertState(sqlite, 'external_document', 'doc-1', 'legacy-document', null, 10);
  insertState(sqlite, 'external_folder', 'folder-1', 'legacy-folder', null, 11);
  insertState(sqlite, 'external_document', 'deleted-doc', 'legacy-delete', 'deleted-time', 12);
}

function insertState(sqlite: Database.Database, type: string, id: string, hash: string,
  deletedAt: string | null, seq: number) {
  sqlite.prepare(`INSERT INTO sync_object_state
    (object_type,object_id,state_seq,content_hash,last_modified_by_host_name,updated_at,deleted_at,sync_dirty)
    VALUES (?,?,?,?,?,'business-time',?,0)`).run(type, id, seq, hash, 'Host', deletedAt);
}

function documentHash() {
  return computeSyncContentHash('external_document', buildCanonicalExternalDocumentPayload({
    body_blob_hash: null, content_hash: 'body-hash', document_id: 'doc-1', extension: 'md',
    file_name: 'doc.md', folder_id: 'folder-1', reference_json: null, reference_kind: 'local_path',
    relative_path: 'doc.md', title: 'Doc'
  }));
}

function folderHash() {
  return computeSyncContentHash('external_folder', buildCanonicalExternalFolderPayload({
    attachment_mode: 'document_relative', excluded_dirs_json: '[".git"]', host_name: 'Host',
    host_platform: 'darwin', id: 'folder-1', source_ref: 'source-1'
  }));
}

function readState(sqlite: Database.Database, type: string, id: string) {
  return sqlite.prepare(`SELECT base_content_hash,content_hash,state_seq,sync_dirty,updated_at
    FROM sync_object_state WHERE object_type=? AND object_id=?`).get(type, id);
}
