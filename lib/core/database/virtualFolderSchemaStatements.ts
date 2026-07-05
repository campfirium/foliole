export const VIRTUAL_FOLDER_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS virtual_folders (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_virtual_folders_deleted_updated
    ON virtual_folders (deleted_at, updated_at)`,
  `CREATE TABLE IF NOT EXISTS virtual_folder_items (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL REFERENCES virtual_folders(id) ON DELETE CASCADE,
    material_node_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_virtual_folder_items_folder_position
    ON virtual_folder_items (folder_id, deleted_at, position, id)`,
  `CREATE INDEX IF NOT EXISTS idx_virtual_folder_items_material
    ON virtual_folder_items (material_node_id)`
];
