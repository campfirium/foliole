import type http from 'node:http';

import { decodeTextBodyBlobData } from '../../lib/core/database/contentBodyBlobs.js';
import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { WorkspaceSearchResult } from '../../lib/core/database/workspaceSearch.js';
import { openDatabaseConnection } from '../database/connection.js';
import { searchWorkspace } from '../database/workspaceSearch.js';

export const AGENT_CONTROL_JSON_BODY_LIMIT_BYTES = 16_384;
export const AGENT_CONTROL_MATERIAL_CONTENT_LIMIT = 4_000;
export const AGENT_CONTROL_MATERIAL_SEARCH_LIMIT = 20;
export const AGENT_CONTROL_MATERIAL_SEARCH_MAX_LIMIT = 40;

interface MaterialRow extends DatabaseRow {
  body_blob_data: Uint8Array | string | null;
  content: string;
  deleted_at: string | null;
  depth: number;
  id: string;
  kind: string;
  parent_id: string | null;
  title: string;
  updated_at: string;
}

export type AgentControlJsonBodyResult =
  | { ok: true; value: unknown }
  | { error: string; errorCategory: string; ok: false; statusCode: number };

export interface AgentMaterialReadPayload {
  content: string;
  content_char_count: number;
  content_truncated: boolean;
  deleted: boolean;
  id: string;
  kind: string;
  parent_titles: string[];
  title: string;
  updated_at: string;
}

export interface AgentMaterialSearchPayload {
  count: number;
  limit: number;
  query: string;
  results: AgentMaterialSearchResult[];
}

export interface AgentMaterialSearchResult {
  excerpt: string;
  id: string;
  kind: WorkspaceSearchResult['kind'];
  match: Record<string, unknown> | null;
  source: Record<string, unknown>;
  title: string;
  updated_at: string;
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
       SELECT n.id, n.parent_id, n.kind, n.title, n.content, cbd.data AS body_blob_data,
              n.deleted_at, n.updated_at, 0 AS depth
       FROM nodes n
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE n.id = ?
       UNION ALL
       SELECT parent.id, parent.parent_id, parent.kind, parent.title, parent.content,
              NULL AS body_blob_data, parent.deleted_at, parent.updated_at, ancestors.depth + 1
       FROM nodes parent
       JOIN ancestors ON parent.id = ancestors.parent_id
     )
     SELECT * FROM ancestors
     ORDER BY depth ASC`,
    [nodeId]
  );
  const node = rows[0];
  if (!node) return null;
  const content = decodeTextBodyBlobData(node.body_blob_data) ?? node.content;
  const truncated = content.length > AGENT_CONTROL_MATERIAL_CONTENT_LIMIT;
  return {
    content: truncated ? content.slice(0, AGENT_CONTROL_MATERIAL_CONTENT_LIMIT) : content,
    content_char_count: content.length,
    content_truncated: truncated,
    deleted: rows.some((row) => row.deleted_at !== null),
    id: node.id,
    kind: node.kind,
    parent_titles: rows.slice(1).reverse().map((row) => row.title),
    title: node.title,
    updated_at: node.updated_at
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

export function projectAgentMaterialSearchResults(
  results: WorkspaceSearchResult[],
  limit: number
): AgentMaterialSearchResult[] {
  return results.slice(0, limit).map((result) => ({
    excerpt: result.excerpt,
    id: result.id,
    kind: result.kind,
    match: projectMatch(result),
    source: projectSource(result),
    title: result.title,
    updated_at: result.updatedAt
  }));
}

function projectMatch(result: WorkspaceSearchResult): Record<string, unknown> | null {
  if (result.nodeMatch) {
    return { kind: 'node', from: result.nodeMatch.from, query: result.nodeMatch.query, to: result.nodeMatch.to };
  }
  if (result.pdfMatch) {
    return {
      attachment_id: result.pdfMatch.attachmentId,
      kind: 'pdf',
      match_start: result.pdfMatch.matchStart,
      page: result.pdfMatch.page,
      page_text_length: result.pdfMatch.pageTextLength,
      query: result.pdfMatch.query
    };
  }
  if (result.externalMatch) {
    return { kind: 'external', query: result.externalMatch.query };
  }
  return null;
}

function projectSource(result: WorkspaceSearchResult): Record<string, unknown> {
  if (result.externalMatch) {
    return {
      kind: 'external',
      imported_material_id: result.externalMatch.importedNodeId ?? null,
      relative_path: result.externalMatch.relativePath,
      source_kind: result.externalMatch.sourceKind
    };
  }
  return { kind: result.kind };
}
