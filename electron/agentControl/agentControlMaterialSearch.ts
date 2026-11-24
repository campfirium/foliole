import type { WorkspaceSearchResult } from '../../lib/core/database/workspaceSearch.js';
import { searchWorkspace } from '../database/workspaceSearch.js';

import { normalizeOptionalLimit } from './agentControlMaterials.js';
import { projectAgentMaterialSearchResults } from './agentControlMaterialsProjection.js';

export function normalizeMaterialSearchLimit(value: unknown) {
  return normalizeOptionalLimit(value, 20, 40);
}

export function searchAgentControlMaterials(query: string, limit: number, offset?: number) {
  const normalizedQuery = query.trim();
  const matches = searchWorkspace(normalizedQuery);
  const start = offset ?? 0;
  return {
    ...projectSearchPage(normalizedQuery, limit, matches.slice(start, start + limit)),
    ...(offset !== undefined ? { next_offset: start + limit < matches.length ? start + limit : null } : {})
  };
}

export function searchScopedAgentControlMaterials(
  query: string,
  limit: number,
  include: (hit: WorkspaceSearchResult) => boolean
) {
  const normalizedQuery = query.trim();
  const eligible: WorkspaceSearchResult[] = [];
  for (const hit of searchWorkspace(normalizedQuery)) {
    if (!include(hit)) continue;
    eligible.push(hit);
    if (eligible.length === limit) break;
  }
  return projectSearchPage(normalizedQuery, limit, eligible);
}

function projectSearchPage(query: string, limit: number, matches: WorkspaceSearchResult[]) {
  const results = projectAgentMaterialSearchResults(matches, limit);
  return { count: results.length, limit, query, results };
}
