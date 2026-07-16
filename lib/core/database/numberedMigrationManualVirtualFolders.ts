import { stringifyManualChildOrder } from '../nodes/manualChildOrder.js';
import {
  createManualVirtualNodeFilter,
  isManualVirtualNodeFilter,
  parseVirtualNodeFilter,
  stringifyVirtualNodeFilter
} from '../nodes/virtualNodeFilter.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { columnExists, tableExists } from './numberedMigrationHelpers.js';

const VIRTUAL_ROOT_NODE_ID = 'special-virtual-root';

interface LegacyVirtualFolderRow {
  created_at: string;
  deleted_at: string | null;
  id: string;
  title: string;
  updated_at: string;
}

interface LegacyVirtualFolderItemRow {
  folder_id: string;
  material_node_id: string;
}

function hasLegacyVirtualFolderShape(sqlite: DatabaseMigrationTarget) {
  return tableExists(sqlite, 'virtual_folders') &&
    tableExists(sqlite, 'virtual_folder_items') &&
    ['id', 'title', 'created_at', 'updated_at', 'deleted_at']
      .every((column) => columnExists(sqlite, 'virtual_folders', column)) &&
    ['folder_id', 'material_node_id', 'position', 'deleted_at']
      .every((column) => columnExists(sqlite, 'virtual_folder_items', column));
}

function ensureVirtualRoot(sqlite: DatabaseMigrationTarget, timestamp: string) {
  sqlite.prepare(
    `INSERT OR IGNORE INTO nodes (
       id, parent_id, kind, title, is_title_manual, hide_title_heading, content,
       virtual_filter, sync_dirty, created_at, updated_at, deleted_at
     ) VALUES (?, NULL, 'folder', 'Virtual', 1, 0, '', NULL, 0, ?, ?, NULL)`
  ).run(VIRTUAL_ROOT_NODE_ID, timestamp, timestamp);
}

function readLegacyFolderItems(sqlite: DatabaseMigrationTarget) {
  const rows = sqlite.prepare(
    `SELECT folder_id, material_node_id
     FROM virtual_folder_items
     WHERE deleted_at IS NULL
     ORDER BY folder_id ASC, position ASC, id ASC`
  ).all() as LegacyVirtualFolderItemRow[];
  const byFolderId = new Map<string, string[]>();
  for (const row of rows) {
    const ids = byFolderId.get(row.folder_id) ?? [];
    if (!ids.includes(row.material_node_id)) ids.push(row.material_node_id);
    byFolderId.set(row.folder_id, ids);
  }
  return byFolderId;
}

function assertCompatibleExistingNode(sqlite: DatabaseMigrationTarget, folderId: string) {
  const row = sqlite.prepare(
    'SELECT parent_id, virtual_filter FROM nodes WHERE id = ?'
  ).all(folderId)[0] as { parent_id: string | null; virtual_filter: string | null } | undefined;
  if (!row) return false;
  if (row.parent_id !== VIRTUAL_ROOT_NODE_ID || !isManualVirtualNodeFilter(parseVirtualNodeFilter(row.virtual_filter))) {
    throw new Error(`legacy virtual folder id conflicts with existing node: ${folderId}`);
  }
  return true;
}

function insertManualVirtualFolder(
  sqlite: DatabaseMigrationTarget,
  folder: LegacyVirtualFolderRow,
  materialNodeIds: string[],
  position: number
) {
  sqlite.prepare(
    `INSERT INTO nodes (
       id, parent_id, kind, manual_child_order, title, is_title_manual, hide_title_heading,
       content, virtual_filter, position, sync_dirty, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'folder', ?, ?, 1, 0, '', ?, ?, 1, ?, ?, ?)`
  ).run(
    folder.id,
    VIRTUAL_ROOT_NODE_ID,
    stringifyManualChildOrder(materialNodeIds),
    folder.title,
    stringifyVirtualNodeFilter(createManualVirtualNodeFilter()),
    position,
    folder.created_at,
    folder.updated_at,
    folder.deleted_at
  );
  sqlite.prepare(
    `INSERT INTO node_order (node_id, position)
     VALUES (?, ?)
     ON CONFLICT(node_id) DO UPDATE SET position = excluded.position`
  ).run(folder.id, position);
}

export function migrateLegacyVirtualFoldersToManualNodes(sqlite: DatabaseMigrationTarget) {
  if (!hasLegacyVirtualFolderShape(sqlite)) return;
  const folders = sqlite.prepare(
    `SELECT id, title, created_at, updated_at, deleted_at
     FROM virtual_folders
     ORDER BY created_at ASC, id ASC`
  ).all() as LegacyVirtualFolderRow[];
  if (folders.length === 0) return;
  const timestamp = new Date().toISOString();
  ensureVirtualRoot(sqlite, timestamp);
  const itemsByFolderId = readLegacyFolderItems(sqlite);
  const positionRow = sqlite.prepare(
    'SELECT COALESCE(MAX(position), -1) AS position FROM node_order'
  ).all()[0] as { position: number } | undefined;
  let position = (positionRow?.position ?? -1) + 1;
  for (const folder of folders) {
    if (!assertCompatibleExistingNode(sqlite, folder.id)) {
      insertManualVirtualFolder(sqlite, folder, itemsByFolderId.get(folder.id) ?? [], position);
    }
    position += 1;
  }
}
