import type { DatabaseDriver } from './driver.js';
import { matchesFtsSearchFields, type FtsSearchQueryPlan } from './ftsSearchQuery.js';
import { buildNodeBodyContentSql } from './nodeBodyResolution.js';
import { NODE_PDF_RESOURCES_SQL } from './nodePdfResourcesSql.js';
import { buildNodeResult, buildPdfResult } from './workspaceSearchResultBuilders.js';
import type { RankedWorkspaceSearchResult } from './workspaceSearchResults.js';
import type { WorkspacePdfSearchRow, WorkspaceSearchRow } from './workspaceSearchSql.js';
import { VISIBLE_NODES_CTE_SQL } from './workspaceVisibleNodesSql.js';

export function loadAliasFallbackWorkspaceMatches(driver: DatabaseDriver, plan: FtsSearchQueryPlan) {
  if (!plan.expandedExpression) return [];
  const results: RankedWorkspaceSearchResult[] = [];
  const bodySql = buildNodeBodyContentSql();
  for (const spelling of plan.aliasSpellings) {
    const nodes = driver.queryAll<WorkspaceSearchRow>(`${VISIBLE_NODES_CTE_SQL}
SELECT n.id, n.title, ${bodySql} AS content, n.updated_at, 500 AS rank
FROM nodes n INNER JOIN visible_nodes visible ON visible.id = n.id
LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
WHERE instr(lower(n.title), ?) > 0 OR instr(lower(${bodySql}), ?) > 0`, [spelling, spelling]);
    for (const row of nodes) {
      if (!matchesFtsSearchFields([row.title, row.content], plan)) continue;
      const result = buildNodeResult(row, spelling, 'fallback', plan.aliasSpellings, plan.triggerSpellings);
      if (result.aliasMatches?.length) results.push(result);
    }
    const pages = driver.queryAll<WorkspacePdfSearchRow>(`${VISIBLE_NODES_CTE_SQL}
SELECT a.node_id AS id, COALESCE(NULLIF(trim(a.original_name), ''), 'PDF Document') AS title,
  ppt.text, ppt.page, length(ppt.text) AS page_text_length, n.updated_at,
  a.id AS attachment_id, 500 AS rank
FROM pdf_page_text ppt
INNER JOIN (${NODE_PDF_RESOURCES_SQL}) a ON a.id = ppt.attachment_id
INNER JOIN nodes n ON n.id = a.node_id
INNER JOIN visible_nodes visible ON visible.id = n.id
WHERE a.mime_type = 'application/pdf' AND a.pdf_index_status = 'ready'
  AND instr(lower(ppt.text), ?) > 0`, [spelling]);
    for (const row of pages) {
      if (!matchesFtsSearchFields([row.text], plan)) continue;
      const result = buildPdfResult(row, spelling, 'fallback', plan.aliasSpellings, plan.triggerSpellings);
      if (result) results.push(result);
    }
  }
  return results;
}
