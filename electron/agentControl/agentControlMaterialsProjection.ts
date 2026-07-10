import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { WorkspaceSearchResult } from '../../lib/core/database/workspaceSearch.js';
import { openDatabaseConnection } from '../database/connection.js';

import {
  projectAgentMaterialIdentity,
  type AgentMaterialSpecialKind
} from './agentControlMaterialIdentity.js';

interface ParentTitleRow extends DatabaseRow {
  depth: number;
  title: string;
}

interface NodeIdentityRow extends DatabaseRow {
  anchor_link: string | null;
  id: string;
  parent_id: string | null;
}

export interface AgentMaterialSearchResult {
  anchor_kind?: 'cloze' | 'highlight';
  excerpt: string;
  id: string;
  kind: WorkspaceSearchResult['kind'];
  match: Record<string, unknown> | null;
  parent_titles: string[];
  special_kind?: AgentMaterialSpecialKind;
  source: Record<string, unknown>;
  title: string;
  updated_at: string;
}

export function projectAgentMaterialSearchResults(
  results: WorkspaceSearchResult[],
  limit: number
): AgentMaterialSearchResult[] {
  const identityCache = new Map<string, ReturnType<typeof projectAgentMaterialIdentity>>();
  const parentTitleCache = new Map<string, string[]>();
  return results.slice(0, limit).map((result) => ({
    ...projectSearchIdentity(result, identityCache),
    excerpt: result.excerpt,
    id: result.id,
    kind: result.kind,
    match: projectMatch(result),
    parent_titles: resolveParentTitles(result, parentTitleCache),
    source: projectSource(result),
    title: result.title,
    updated_at: result.updatedAt
  }));
}

function projectSearchIdentity(
  result: WorkspaceSearchResult,
  cache: Map<string, ReturnType<typeof projectAgentMaterialIdentity>>
) {
  if (result.kind !== 'node') return {};
  return resolveNodeIdentity(result.id, cache);
}

function resolveNodeIdentity(nodeId: string, cache: Map<string, ReturnType<typeof projectAgentMaterialIdentity>>) {
  if (cache.has(nodeId)) return cache.get(nodeId);
  const row = openDatabaseConnection().driver.queryOne<NodeIdentityRow>(
    'SELECT id, parent_id, anchor_link FROM nodes WHERE id = ?',
    [nodeId]
  );
  const identity = row ? projectAgentMaterialIdentity(row) : {};
  cache.set(nodeId, identity);
  return identity;
}

function resolveParentTitles(result: WorkspaceSearchResult, cache: Map<string, string[]>) {
  if (result.kind !== 'node') return [];
  const cached = cache.get(result.id);
  if (cached) return cached;
  const parentTitles = readNodeParentTitles(result.id);
  cache.set(result.id, parentTitles);
  return parentTitles;
}

function readNodeParentTitles(nodeId: string) {
  const rows = openDatabaseConnection().driver.queryAll<ParentTitleRow>(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, title, 0 AS depth
       FROM nodes
       WHERE id = ?
       UNION ALL
       SELECT parent.id, parent.parent_id, parent.title, ancestors.depth + 1
       FROM nodes parent
       JOIN ancestors ON parent.id = ancestors.parent_id
     )
     SELECT title, depth FROM ancestors
     WHERE depth > 0
     ORDER BY depth DESC`,
    [nodeId]
  );
  return rows.map((row) => row.title);
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
      readable_material_id: result.externalMatch.importedNodeId ?? null,
      relative_path: result.externalMatch.relativePath,
      source_kind: result.externalMatch.sourceKind
    };
  }
  if (result.kind === 'node' || result.kind === 'pdf') {
    return { kind: result.kind, readable_material_id: result.id };
  }
  return { kind: result.kind };
}
