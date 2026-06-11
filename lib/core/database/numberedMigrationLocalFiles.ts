import { LOCAL_FILE_SCHEMA_STATEMENTS } from './localFileSchemaStatements.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';

const OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID = 'opened-external-documents';

export function migrateLocalFilesRegistry(sqlite: DatabaseMigrationTarget) {
  for (const statement of LOCAL_FILE_SCHEMA_STATEMENTS) {
    sqlite.exec(statement);
  }
}

export function resetOpenedLocalFileHistory(sqlite: DatabaseMigrationTarget) {
  const hasExternalDocuments = tableExists(sqlite, 'external_documents');
  if (tableExists(sqlite, 'local_files')) {
    sqlite.exec('DELETE FROM local_files');
  }
  if (hasExternalDocuments) {
    sqlite.prepare('DELETE FROM external_documents WHERE folder_id = ?').run(OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID);
  }
  if (tableExists(sqlite, 'external_search_folders')) {
    sqlite.prepare('DELETE FROM external_search_folders WHERE id = ?').run(OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID);
  }
  if (tableExists(sqlite, 'sync_object_state')) {
    sqlite.prepare("DELETE FROM sync_object_state WHERE object_type = 'external_folder' AND object_id = ?")
      .run(OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID);
    if (hasExternalDocuments) {
      sqlite
        .prepare(`DELETE FROM sync_object_state WHERE object_type = 'external_document'
          AND object_id NOT IN (SELECT document_id FROM external_documents)`)
        .run();
    }
  }
  if (tableExists(sqlite, 'sync_change_log')) {
    sqlite.prepare("DELETE FROM sync_change_log WHERE object_type = 'external_folder' AND object_id = ?")
      .run(OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID);
    if (hasExternalDocuments) {
      sqlite
        .prepare(`DELETE FROM sync_change_log WHERE object_type = 'external_document'
          AND object_id NOT IN (SELECT document_id FROM external_documents)`)
        .run();
    }
  }
}
