import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { parseManualChildOrder } from '../../lib/core/nodes/manualChildOrder.js';
import { readTopicCollections } from '../../lib/core/nodes/topicCollectionsFrontmatter.js';
import { isManualVirtualNodeFilter, parseVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';
import { openDatabaseConnection } from '../database/connection.js';

import { normalizeOptionalLimit } from './agentControlMaterials.js';

export const AGENT_CONTROL_VIRTUAL_FOLDER_LIST_LIMIT = 50;
export const AGENT_CONTROL_VIRTUAL_FOLDER_LIST_MAX_LIMIT = 100;
export const AGENT_CONTROL_VIRTUAL_FOLDER_ITEM_LIMIT = 100;
export const AGENT_CONTROL_VIRTUAL_FOLDER_ITEM_MAX_LIMIT = 500;
export const VIRTUAL_ROOT_NODE_ID = 'special-virtual-root';

interface FolderRow extends DatabaseRow {
  created_at: string;
  deleted_at: string | null;
  id: string;
  manual_child_order: string | null;
  title: string;
  updated_at: string;
  virtual_filter: string | null;
}

export interface AgentVirtualFolderTopicRow extends DatabaseRow, NodeBodyRow {
  id: string;
  kind: string;
  title: string;
  updated_at: string;
}

export interface AgentVirtualFolderSummary {
  created_at: string;
  id: string;
  item_count: number;
  title: string;
  updated_at: string;
}

export interface AgentVirtualFolderItem {
  id: string;
  material: { id: string; kind: string; title: string; updated_at: string };
  material_id: string;
  position: number;
  status: 'available';
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

export const normalizeVirtualFolderListLimit = (value: unknown) => normalizeOptionalLimit(
  value, AGENT_CONTROL_VIRTUAL_FOLDER_LIST_LIMIT, AGENT_CONTROL_VIRTUAL_FOLDER_LIST_MAX_LIMIT
);

export const normalizeVirtualFolderItemLimit = (value: unknown) => normalizeOptionalLimit(
  value, AGENT_CONTROL_VIRTUAL_FOLDER_ITEM_LIMIT, AGENT_CONTROL_VIRTUAL_FOLDER_ITEM_MAX_LIMIT
);

export function listAgentControlVirtualFolders(limit: number): AgentVirtualFolderListPayload {
  const folders = readFolderRows(false).slice(0, limit);
  const topics = readActiveTopics();
  return {
    count: folders.length,
    limit,
    virtual_folders: folders.map((folder) => toSummary(folder, orderedMemberTopics(folder, topics).length))
  };
}

export function readAgentControlVirtualFolder(folderId: string, limit: number): AgentVirtualFolderReadPayload | null {
  const folder = readFolderRows(false).find((row) => row.id === folderId);
  if (!folder) return null;
  const matched = orderedMemberTopics(folder, readActiveTopics());
  return {
    folder: toSummary(folder, matched.length),
    items: matched.slice(0, limit).map(toItem),
    limit,
    total_count: matched.length,
    truncated: matched.length > limit
  };
}

export function readAgentVirtualFolderRow(id: string, includeDeleted = false) {
  return readFolderRows(includeDeleted).find((row) => row.id === id) ?? null;
}

export function readAgentVirtualFolderTopics(folderId: string) {
  const folder = readAgentVirtualFolderRow(folderId, true);
  return folder ? orderedMemberTopics(folder, readActiveTopics()) : [];
}

export function readAgentVirtualFolderTopicRows(ids: string[]) {
  const wanted = new Set(ids);
  return readActiveTopics().filter((row) => wanted.has(row.id));
}

function readFolderRows(includeDeleted: boolean) {
  const rows = openDatabaseConnection().driver.queryAll<FolderRow>(
    `SELECT id, title, manual_child_order, virtual_filter, created_at, updated_at, deleted_at FROM nodes
     WHERE parent_id = ? AND kind = 'folder' ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
     ORDER BY updated_at DESC, id ASC`,
    [VIRTUAL_ROOT_NODE_ID]
  );
  return rows.filter((row) => isManualVirtualNodeFilter(parseVirtualNodeFilter(row.virtual_filter)));
}

export function readCollectionVirtualFolderRow(id: string) {
  const row = openDatabaseConnection().driver.queryOne<FolderRow>(
    `SELECT id, title, manual_child_order, virtual_filter, created_at, updated_at, deleted_at
     FROM nodes WHERE id = ? AND parent_id = ? AND kind = 'folder' AND deleted_at IS NULL`,
    [id, VIRTUAL_ROOT_NODE_ID]
  );
  if (!row) return null;
  const filter = parseVirtualNodeFilter(row.virtual_filter);
  return filter?.conditions.length === 1 && filter.conditions[0]?.field === 'collection' &&
    filter.conditions[0].operator === 'equals' && filter.conditions[0].value === row.title
    ? row
    : null;
}

function readActiveTopics() {
  return openDatabaseConnection().driver.queryAll<AgentVirtualFolderTopicRow>(
    `SELECT n.id, n.kind, n.title, n.content, n.body_blob_hash, n.updated_at, cbd.data AS body_blob_data
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.kind = 'topic' AND n.deleted_at IS NULL
     ORDER BY COALESCE(n.position, 999999), lower(n.title), n.id`,
    []
  );
}

function matchingTopics(name: string, rows: AgentVirtualFolderTopicRow[]) {
  return rows.filter((row) => {
    try {
      return readTopicCollections(readTopicContent(row)).includes(name);
    } catch {
      return false;
    }
  });
}

export function readCollectionVirtualFolderTopics(name: string) {
  return matchingTopics(name, readActiveTopics());
}

export function readTopicContent(row: Pick<AgentVirtualFolderTopicRow, 'body_blob_data' | 'body_blob_hash' | 'content' | 'id'>) {
  return requireResolvedNodeBody(row, row.id).content;
}

function orderedMemberTopics(folder: FolderRow, rows: AgentVirtualFolderTopicRow[]) {
  const order = parseManualChildOrder(folder.manual_child_order);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return (order ?? []).flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

function toSummary(row: FolderRow, itemCount: number): AgentVirtualFolderSummary {
  return { created_at: row.created_at, id: row.id, item_count: itemCount, title: row.title, updated_at: row.updated_at };
}

function toItem(row: AgentVirtualFolderTopicRow, index: number): AgentVirtualFolderItem {
  return {
    id: row.id,
    material: { id: row.id, kind: row.kind, title: row.title, updated_at: row.updated_at },
    material_id: row.id,
    position: (index + 1) * 10,
    status: 'available'
  };
}
