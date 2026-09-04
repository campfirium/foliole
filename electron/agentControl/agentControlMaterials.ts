import type http from 'node:http';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import type { WorkspaceSearchResult } from '../../lib/core/database/workspaceSearch.js';
import { openDatabaseConnection } from '../database/connection.js';
import { searchWorkspace } from '../database/workspaceSearch.js';

import { projectAgentMaterialIdentity, type AgentMaterialSpecialKind } from './agentControlMaterialIdentity.js';
import {
  readAgentControlMaterialListParent,
  type AgentMaterialListParentSummary
} from './agentControlMaterialListParents.js';
import {
  projectAgentMaterialReveal,
  projectAgentMaterialSearchResults,
  type AgentMaterialSearchResult
} from './agentControlMaterialsProjection.js';

export const AGENT_CONTROL_JSON_BODY_LIMIT_BYTES = 16_384;
export const AGENT_CONTROL_MATERIAL_CONTENT_LIMIT = 4_000;
export const AGENT_CONTROL_MATERIAL_CHILDREN_LIMIT = 30;
export const AGENT_CONTROL_MATERIAL_CHILD_PREVIEW_LIMIT = 220;
export const AGENT_CONTROL_MATERIAL_SEARCH_LIMIT = 20;
export const AGENT_CONTROL_MATERIAL_SEARCH_MAX_LIMIT = 40;

interface MaterialRow extends DatabaseRow, NodeBodyRow {
  anchor_link: string | null;
  body_blob_data: Uint8Array | string | null;
  content: string;
  deleted_at: string | null;
  depth: number;
  id: string;
  kind: string;
  parent_id: string | null;
  reveal: string | null;
  title: string;
  updated_at: string;
}

export type AgentControlJsonBodyResult =
  | { ok: true; value: unknown }
  | { error: string; errorCategory: string; ok: false; statusCode: number };

export interface AgentMaterialReadPayload {
  anchor_kind?: 'cloze' | 'highlight';
  child_count: number;
  children: AgentMaterialChildSummary[];
  children_truncated: boolean;
  content: string;
  content_char_count: number;
  content_truncated: boolean;
  deleted: boolean;
  id: string;
  kind: string;
  parent_id: string | null;
  parent_titles: string[];
  parents: AgentMaterialParentSummary[];
  reveal?: string;
  reveal_char_count?: number;
  reveal_truncated?: boolean;
  special_kind?: AgentMaterialSpecialKind;
  title: string;
  updated_at: string;
}

export interface AgentMaterialParentSummary {
  id: string;
  title: string;
}

export interface AgentMaterialChildSummary {
  anchor_kind?: 'cloze' | 'highlight';
  content_preview: string;
  has_content: boolean;
  id: string;
  kind: string;
  special_kind?: AgentMaterialSpecialKind;
  title: string;
  updated_at: string;
}

export interface AgentMaterialSearchPayload {
  count: number;
  limit: number;
  query: string;
  results: AgentMaterialSearchResult[];
}

export interface AgentMaterialChildrenPayload {
  child_count: number;
  children: AgentMaterialChildSummary[];
  children_truncated: boolean;
  limit: number;
  parent: AgentMaterialListParentSummary | null;
  parent_id: string | null;
}

export async function readAgentControlJsonBody(request: http.IncomingMessage): Promise<AgentControlJsonBodyResult> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > AGENT_CONTROL_JSON_BODY_LIMIT_BYTES) {
      return { error: 'request_body_too_large', errorCategory: 'request_body_too_large', ok: false, statusCode: 413 };
    }
    chunks.push(buffer);
  }
  try {
    const text = Buffer.concat(chunks).toString('utf8').trim();
    return { ok: true, value: text ? JSON.parse(text) : {} };
  } catch {
    return { error: 'invalid_json', errorCategory: 'invalid_json', ok: false, statusCode: 400 };
  }
}

export function normalizeBodyObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeOptionalLimit(value: unknown, fallback: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

export function readAgentControlMaterial(nodeId: string): AgentMaterialReadPayload | null {
  const rows = openDatabaseConnection().driver.queryAll<MaterialRow>(
    `WITH RECURSIVE ancestors AS (
       SELECT n.id, n.parent_id, n.kind, n.title, n.content, n.body_blob_hash, n.reveal, n.anchor_link, cbd.data AS body_blob_data,
              n.deleted_at, n.updated_at, 0 AS depth
       FROM nodes n
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE n.id = ?
       UNION ALL
       SELECT parent.id, parent.parent_id, parent.kind, parent.title, parent.content, parent.body_blob_hash,
              parent.reveal, parent.anchor_link, NULL AS body_blob_data,
              parent.deleted_at, parent.updated_at, ancestors.depth + 1
       FROM nodes parent
       JOIN ancestors ON parent.id = ancestors.parent_id
     )
     SELECT * FROM ancestors
     ORDER BY depth ASC`,
    [nodeId]
  );
  const node = rows[0];
  if (!node) return null;
  const content = requireResolvedNodeBody(node, node.id).content;
  const truncated = content.length > AGENT_CONTROL_MATERIAL_CONTENT_LIMIT;
  const children = readAgentControlMaterialChildren(node.id);
  return {
    child_count: children.count,
    children: children.items,
    children_truncated: children.truncated,
    content: truncated ? content.slice(0, AGENT_CONTROL_MATERIAL_CONTENT_LIMIT) : content,
    content_char_count: content.length,
    content_truncated: truncated,
    deleted: rows.some((row) => row.deleted_at !== null),
    id: node.id,
    kind: node.kind,
    parent_id: node.parent_id,
    parent_titles: rows.slice(1).reverse().map((row) => row.title),
    parents: rows.slice(1).reverse().map((row) => ({ id: row.id, title: row.title })),
    ...(node.kind === 'item' ? projectAgentMaterialReveal(node.reveal, AGENT_CONTROL_MATERIAL_CONTENT_LIMIT) : {}),
    ...projectAgentMaterialIdentity(node),
    title: node.title,
    updated_at: node.updated_at
  };
}

export function listAgentControlMaterialChildren(parentId: string | null, limit: number): AgentMaterialChildrenPayload {
  const parent = readAgentControlMaterialListParent(parentId);
  const children = readAgentControlMaterialChildrenWithLimit(parentId, limit);
  return {
    child_count: children.count,
    children: children.items,
    children_truncated: children.truncated,
    limit,
    parent,
    parent_id: parentId
  };
}

function readAgentControlMaterialChildren(nodeId: string) {
  return readAgentControlMaterialChildrenWithLimit(nodeId, AGENT_CONTROL_MATERIAL_CHILDREN_LIMIT);
}

function readAgentControlMaterialChildrenWithLimit(nodeId: string | null, limit: number) {
  const rows = openDatabaseConnection().driver.queryAll<MaterialRow>(
    `SELECT n.id, n.parent_id, n.kind, n.title, n.content, n.body_blob_hash, n.anchor_link, cbd.data AS body_blob_data,
            n.deleted_at, n.updated_at, 0 AS depth
       FROM nodes n
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE ${nodeId === null ? 'n.parent_id IS NULL' : 'n.parent_id = ?'} AND n.deleted_at IS NULL
       ORDER BY COALESCE(n.position, 999999), lower(n.title), n.updated_at DESC
       LIMIT ?`,
    nodeId === null ? [limit + 1] : [nodeId, limit + 1]
  );
  const visibleRows = rows.slice(0, limit);
  return {
    count: countAgentControlMaterialChildren(nodeId),
    items: visibleRows.map(toChildSummary),
    truncated: rows.length > limit
  };
}

function countAgentControlMaterialChildren(nodeId: string | null) {
  const row = openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM nodes WHERE ${nodeId === null ? 'parent_id IS NULL' : 'parent_id = ?'} AND deleted_at IS NULL`,
    nodeId === null ? [] : [nodeId]
  );
  return row?.count ?? 0;
}

function toChildSummary(row: MaterialRow): AgentMaterialChildSummary {
  const content = requireResolvedNodeBody(row, row.id).content;
  return {
    ...projectAgentMaterialIdentity(row),
    content_preview: content.slice(0, AGENT_CONTROL_MATERIAL_CHILD_PREVIEW_LIMIT),
    has_content: content.trim().length > 0,
    id: row.id,
    kind: row.kind,
    title: row.title,
    updated_at: row.updated_at
  };
}

export function searchAgentControlMaterials(query: string, limit: number): AgentMaterialSearchPayload {
  const normalizedQuery = query.trim();
  const results = projectAgentMaterialSearchResults(searchWorkspace(normalizedQuery) as WorkspaceSearchResult[], limit);
  return {
    count: results.length,
    limit,
    query: normalizedQuery,
    results
  };
}
