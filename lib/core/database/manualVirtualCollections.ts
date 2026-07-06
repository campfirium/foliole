import type { DatabaseDriver, DatabaseRow } from './driver.js';

export interface WorkspaceManualVirtualCollection {
  availableMaterialNodeIds: string[];
  description: string;
  id: string;
  itemCount: number;
  title: string;
  updatedAt: string;
}

interface ManualVirtualFolderRow extends DatabaseRow {
  description: string;
  id: string;
  item_count: number;
  title: string;
  updated_at: string;
}

interface ManualVirtualFolderItemRow extends DatabaseRow {
  folder_id: string;
  material_node_id: string;
}

export function loadWorkspaceManualVirtualCollections(driver: DatabaseDriver): WorkspaceManualVirtualCollection[] {
  const folders = driver.queryAll<ManualVirtualFolderRow>(
    `SELECT vf.id, vf.title, vf.description, vf.updated_at,
            COUNT(vfi.id) AS item_count
     FROM virtual_folders vf
     LEFT JOIN virtual_folder_items vfi ON vfi.folder_id = vf.id AND vfi.deleted_at IS NULL
     WHERE vf.deleted_at IS NULL
     GROUP BY vf.id
     ORDER BY vf.updated_at DESC, vf.id ASC`
  ) ?? [];
  if (folders.length === 0) {
    return [];
  }
  const itemsByFolderId = new Map<string, string[]>();
  for (const row of driver.queryAll<ManualVirtualFolderItemRow>(
    `SELECT vfi.folder_id, vfi.material_node_id
     FROM virtual_folder_items vfi
     INNER JOIN nodes n ON n.id = vfi.material_node_id
     WHERE vfi.deleted_at IS NULL
       AND n.deleted_at IS NULL
       AND n.kind != 'folder'
       AND n.anchor_link IS NULL
     ORDER BY vfi.folder_id ASC, vfi.position ASC, vfi.id ASC`
  ) ?? []) {
    const items = itemsByFolderId.get(row.folder_id) ?? [];
    items.push(row.material_node_id);
    itemsByFolderId.set(row.folder_id, items);
  }
  return folders.map((folder) => ({
    availableMaterialNodeIds: itemsByFolderId.get(folder.id) ?? [],
    description: folder.description,
    id: folder.id,
    itemCount: folder.item_count,
    title: folder.title,
    updatedAt: folder.updated_at
  }));
}