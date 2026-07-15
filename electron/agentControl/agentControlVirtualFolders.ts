import { decodeTextBodyBlobData } from '../../lib/core/database/contentBodyBlobs.js';
import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { parseManualChildOrder } from '../../lib/core/nodes/manualChildOrder.js';
import { readTopicCollections } from '../../lib/core/nodes/topicCollectionsFrontmatter.js';
import { parseVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter.js';
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

export interface AgentVirtualFolderTopicRow extends DatabaseRow {
  body_blob_data: Uint8Array | string | null;
  content: string;
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
    virtual_folders: folders.map((folder) => toSummary(folder, matchingTopics(folder.title, topics).length))
  };
}

export function readAgentControlVirtualFolder(folderId: string, limit: number): AgentVirtualFolderReadPayload | null {
  const folder = readFolderRows(false).find((row) => row.id === folderId);
  if (!folder) return null;
  const matched = orderTopics(matchingTopics(folder.title, readActiveTopics()), parseManualChildOrder(folder.manual_child_order));
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

export function readAgentVirtualFolderTopics(name: string) {
  return matchingTopics(name, readActiveTopics());
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
  return rows.filter(isCollectionFolderRow);
}

function isCollectionFolderRow(row: FolderRow) {
  const filter = parseVirtualNodeFilter(row.virtual_filter);
  return filter?.conditions.length === 1 && filter.conditions[0]?.field === 'collection' &&
    filter.conditions[0].operator === 'equals' && filter.conditions[0].value === row.title;
}

function readActiveTopics() {
  return openDatabaseConnection().driver.queryAll<AgentVirtualFolderTopicRow>(
    `SELECT n.id, n.kind, n.title, n.content, n.updated_at, cbd.data AS body_blob_data
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

export function readTopicContent(row: Pick<AgentVirtualFolderTopicRow, 'body_blob_data' | 'content'>) {
  return decodeTextBodyBlobData(row.body_blob_data) ?? row.content;
}

function orderTopics(rows: AgentVirtualFolderTopicRow[], order: string[] | null) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = (order ?? []).flatMap((id) => byId.delete(id) ? [rows.find((row) => row.id === id)!] : []);
  return [...ordered, ...rows.filter((row) => byId.has(row.id))];
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
