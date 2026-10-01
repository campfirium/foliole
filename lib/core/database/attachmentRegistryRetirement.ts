import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { migrateNodeResourceReferences } from './nodeResourceReferencesMigration.js';
import { appendMigratedNodeResourceVersions } from './nodeResourceVersionMigration.js';

/** The caller owns the upgrade transaction. This never touches attachment files or old versions. */
export function retireAttachmentRegistry(sqlite: DatabaseMigrationTarget) {
  migrateNodeResourceReferences(sqlite);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS pdf_index_state (
    attachment_id TEXT PRIMARY KEY,
    status TEXT, indexed_at TEXT, error TEXT, version INTEGER, attempt INTEGER
  );
  INSERT OR IGNORE INTO pdf_index_state SELECT id, pdf_index_status, pdf_indexed_at, pdf_index_error,
    pdf_index_version, pdf_index_attempt FROM attachments WHERE mime_type = 'application/pdf';
  CREATE TABLE pdf_page_text_next (
    attachment_id TEXT NOT NULL, page INTEGER NOT NULL, text TEXT NOT NULL,
    page_width REAL, page_height REAL, PRIMARY KEY (attachment_id, page)
  );
  INSERT INTO pdf_page_text_next SELECT attachment_id, page, text, page_width, page_height FROM pdf_page_text;
  DROP TABLE pdf_page_text;
  ALTER TABLE pdf_page_text_next RENAME TO pdf_page_text;
  DROP TABLE node_attachments;
  DROP TABLE attachments;
  DELETE FROM sync_object_state WHERE object_type = 'attachment';
  DELETE FROM sync_change_log WHERE object_type = 'attachment';
  DELETE FROM sync_delivery_receipts WHERE object_type = 'attachment';
  UPDATE nodes SET sync_dirty = 1 WHERE resource_references <> '[]';`);
  appendMigratedNodeResourceVersions(sqlite);
}
