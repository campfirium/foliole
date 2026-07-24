import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';

const OWNED_FOLDER_INDEX = `CREATE UNIQUE INDEX IF NOT EXISTS idx_external_search_folders_owner_path
  ON external_search_folders (owner_installation_id, folder_path)
  WHERE owner_installation_id IS NOT NULL`;

function createDevicePreferences(sqlite: DatabaseMigrationTarget) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS external_folder_device_preferences (
    installation_id TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (installation_id, folder_id)
  )`);
}

export function migrateExternalFolderOwnership(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'external_search_folders')) {
    createDevicePreferences(sqlite);
    return;
  }
  sqlite.exec(`CREATE TABLE external_search_folders_next (
    id TEXT PRIMARY KEY,
    folder_path TEXT NOT NULL,
    attachment_mode TEXT NOT NULL,
    attachment_root_path TEXT,
    excluded_dirs_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'idle',
    document_count INTEGER NOT NULL DEFAULT 0,
    indexed_at TEXT,
    last_error TEXT,
    owner_installation_id TEXT,
    owner_device_name TEXT,
    owner_platform TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  sqlite.exec(`INSERT INTO external_search_folders_next (
    id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json, status,
    document_count, indexed_at, last_error, created_at, updated_at
  ) SELECT id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json, status,
    document_count, indexed_at, last_error, created_at, updated_at FROM external_search_folders`);
  sqlite.exec('DROP TABLE external_search_folders');
  sqlite.exec('ALTER TABLE external_search_folders_next RENAME TO external_search_folders');
  sqlite.exec(OWNED_FOLDER_INDEX);
  createDevicePreferences(sqlite);
}
