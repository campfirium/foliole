import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { openDatabaseConnection } from '../database/connection.js';

import { normalizeOptionalLimit } from './agentControlMaterials.js';

export const AGENT_CONTROL_VIRTUAL_FOLDER_LIST_LIMIT = 50;
export const AGENT_CONTROL_VIRTUAL_FOLDER_LIST_MAX_LIMIT = 100;
export const AGENT_CONTROL_VIRTUAL_FOLDER_ITEM_LIMIT = 100;
export const AGENT_CONTROL_VIRTUAL_FOLDER_ITEM_MAX_LIMIT = 500;

interface VirtualFolderRow extends DatabaseRow {
  created_at: string;
  description: string;
  id: string;
  item_count: number;
  title: string;
  updated_at: string;
}

interface VirtualFolderItemRow extends DatabaseRow {
  id: string;
  material_deleted_at: string | null;
  material_id: string | null;
  material_kind: string | null;
  material_title: string | null;
  material_updated_at: string | null;
  material_node_id: string;
  position: number;
}

export interface AgentVirtualFolderSummary {
  created_at: string;
  description: string;
  id: string;
  item_count: number;
  title: string;
  updated_at: string;
}

export interface AgentVirtualFolderItem {
  id: string;
  material: AgentVirtualFolderItemMaterial | null;
  material_id: string;
  position: number;
  status: 'available' | 'deleted' | 'missing';
}

interface AgentVirtualFolderItemMaterial {
  id: string;
  kind: string;
  title: string;
  updated_at: string;
}

export interface AgentVirtualFolderListPayload {
  count: number;
  limit: number;
  virtual_folders: AgentVirtualFolderSummary[];
}

export interface AgentVirtualFolderReadPayload {
  folder: AgentVirtualFolderSummary;
  items: AgentVirtualFolderItem[];
  limit: number;
  total_count: number;
  truncated: boolean;
}

export function normalizeVirtualFolderListLimit(value: unknown) {
  return normalizeOptionalLimit(
    value,
    AGENT_CONTROL_VIRTUAL_FOLDER_LIST_LIMIT,
    AGENT_CONTROL_VIRTUAL_FOLDER_LIST_MAX_LIMIT
  );
}

export function normalizeVirtualFolderItemLimit(value: unknown) {
  return normalizeOptionalLimit(
    value,
    AGENT_CONTROL_VIRTUAL_FOLDER_ITEM_LIMIT,
    AGENT_CONTROL_VIRTUAL_FOLDER_ITEM_MAX_LIMIT
  );
}

export function listAgentControlVirtualFolders(limit: number): AgentVirtualFolderListPayload {
  const folders = openDatabaseConnection().driver.queryAll<VirtualFolderRow>(
    `SELECT vf.id, vf.title, vf.description, vf.created_at, vf.updated_at,
            COUNT(vfi.id) AS item_count
     FROM virtual_folders vf
     LEFT JOIN virtual_folder_items vfi ON vfi.folder_id = vf.id AND vfi.deleted_at IS NULL
     WHERE vf.deleted_at IS NULL
     GROUP BY vf.id
     ORDER BY vf.updated_at DESC, vf.id ASC
     LIMIT ?`,
    [limit]
  ).map(toFolderSummary);
  return { count: folders.length, limit, virtual_folders: folders };
}

export function readAgentControlVirtualFolder(folderId: string, limit: number): AgentVirtualFolderReadPayload | null {
  const folder = openDatabaseConnection().driver.queryOne<VirtualFolderRow>(
    `SELECT vf.id, vf.title, vf.description, vf.created_at, vf.updated_at,
            COUNT(vfi.id) AS item_count
     FROM virtual_folders vf
     LEFT JOIN virtual_folder_items vfi ON vfi.folder_id = vf.id AND vfi.deleted_at IS NULL
     WHERE vf.id = ? AND vf.deleted_at IS NULL
     GROUP BY vf.id`,
    [folderId]
  );
  if (!folder) return null;
  const totalCount = folder.item_count;
  const items = openDatabaseConnection().driver.queryAll<VirtualFolderItemRow>(
    `SELECT vfi.id, vfi.material_node_id, vfi.position,
            n.id AS material_id, n.kind AS material_kind, n.title AS material_title,
            n.updated_at AS material_updated_at, n.deleted_at AS material_deleted_at
     FROM virtual_folder_items vfi
     LEFT JOIN nodes n ON n.id = vfi.material_node_id
     WHERE vfi.folder_id = ? AND vfi.deleted_at IS NULL
     ORDER BY vfi.position ASC, vfi.id ASC
     LIMIT ?`,
    [folderId, limit]
  ).map(toFolderItem);
  return {
    folder: toFolderSummary(folder),
    items,
    limit,
    total_count: totalCount,
    truncated: totalCount > items.length
  };
}

function toFolderSummary(row: VirtualFolderRow): AgentVirtualFolderSummary {
  return {
    created_at: row.created_at,
    description: row.description,
    id: row.id,
    item_count: row.item_count,
    title: row.title,
    updated_at: row.updated_at
  };
}

function toFolderItem(row: VirtualFolderItemRow): AgentVirtualFolderItem {
  if (!row.material_id) {
    return { id: row.id, material: null, material_id: row.material_node_id, position: row.position, status: 'missing' };
  }
  const status = row.material_deleted_at ? 'deleted' : 'available';
  return {
    id: row.id,
    material: {
      id: row.material_id,
      kind: row.material_kind ?? 'topic',
      title: row.material_title ?? '',
      updated_at: row.material_updated_at ?? ''
    },
    material_id: row.material_node_id,
    position: row.position,
    status
  };
}
