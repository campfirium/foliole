export const ANDROID_COMPANION_EXTERNAL_FOLDER_OWNERSHIP_MIGRATION_STATEMENTS = {
  externalFoldersNextTable: `CREATE TABLE external_search_folders_next (
    id TEXT PRIMARY KEY, folder_path TEXT NOT NULL, attachment_mode TEXT NOT NULL,
    attachment_root_path TEXT, excluded_dirs_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'idle',
    document_count INTEGER NOT NULL DEFAULT 0, indexed_at TEXT, last_error TEXT,
    owner_installation_id TEXT, owner_device_name TEXT, owner_platform TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  externalFoldersCopyLegacyRows: `INSERT INTO external_search_folders_next (
    id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json, status,
    document_count, indexed_at, last_error, created_at, updated_at
  ) SELECT id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json, status,
    document_count, indexed_at, last_error, created_at, updated_at FROM external_search_folders`,
  externalFoldersDropLegacyTable: 'DROP TABLE external_search_folders',
  externalFoldersOwnerPathIndex: `CREATE UNIQUE INDEX IF NOT EXISTS idx_external_search_folders_owner_path
    ON external_search_folders (owner_installation_id, folder_path) WHERE owner_installation_id IS NOT NULL`,
  externalFoldersRenameNextTable: 'ALTER TABLE external_search_folders_next RENAME TO external_search_folders'
} as const;

export const ANDROID_COMPANION_EXTERNAL_FOLDER_OWNERSHIP_ACTION_TYPES = {
  migrateExternalFolderOwnership: 'migrateExternalFolderOwnership'
} as const;

export const ANDROID_COMPANION_EXTERNAL_FOLDER_OWNERSHIP_PLAN_STEP = {
  actions: [{ type: 'migrateExternalFolderOwnership' }],
  beforeVersion: 21
} as const;
