import type { DatabaseDriver } from './driver.js';
import { matchesFtsSearchFields, type FtsSearchQueryPlan } from './ftsSearchQuery.js';
import { buildNodeResult, buildPdfResult } from './workspaceSearchResultBuilders.js';
import type { RankedWorkspaceSearchResult } from './workspaceSearchResults.js';
import type { WorkspacePdfSearchRow, WorkspaceSearchRow } from './workspaceSearchSql.js';
import { NODE_INDEX_COLUMNS, PDF_INDEX_COLUMNS } from './workspaceSearchSql.js';

export function loadAliasFallbackWorkspaceMatches(driver: DatabaseDriver, plan: FtsSearchQueryPlan) {
  if (!plan.expandedExpression) return [];
  const results: RankedWorkspaceSearchResult[] = [];
  for (const spelling of plan.aliasSpellings) {
    const nodes = driver.queryAll<WorkspaceSearchRow>(`SELECT ${NODE_INDEX_COLUMNS}, 500 AS rank
      FROM search.node_search WHERE instr(lower(title), ?) > 0 OR instr(lower(content), ?) > 0`, [spelling, spelling]);
    for (const row of nodes) {
      if (!matchesFtsSearchFields([row.title, row.content], plan)) continue;
      const result = buildNodeResult(row, spelling, 'fallback', plan.aliasSpellings, plan.triggerSpellings);
      if (result.aliasMatches?.length) results.push(result);
    }
    const pages = driver.queryAll<WorkspacePdfSearchRow>(`SELECT ${PDF_INDEX_COLUMNS}, 500 AS rank
      FROM search.pdf_search WHERE instr(lower(text), ?) > 0`, [spelling]);
    for (const row of pages) {
      if (!matchesFtsSearchFields([row.text], plan)) continue;
      const result = buildPdfResult(row, spelling, 'fallback', plan.aliasSpellings, plan.triggerSpellings);
      if (result) results.push(result);
    }
  }
  return results;
}
