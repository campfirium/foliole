import type { DatabaseDriver } from './driver.js';
import { buildNodeBodyContentSql } from './nodeBodyResolution.js';
import { NODE_PDF_RESOURCES_SQL } from './nodePdfResourcesSql.js';
import {
  type WorkspacePdfCrossPageSearchRow,
  type WorkspacePdfSearchRow,
  type WorkspaceSearchRow
} from './workspaceSearchSql.js';
import { VISIBLE_NODES_CTE_SQL } from './workspaceVisibleNodesSql.js';

export function normalizeSearchHaystack(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function hasAllSearchTerms(value: string, terms: string[]) {
  const haystack = normalizeSearchHaystack(value);
  return terms.every((term) => haystack.includes(term));
}

export function nodeRowMatchesShortTerms(row: WorkspaceSearchRow, shortTerms: string[]) {
  return hasAllSearchTerms(`${row.title} ${row.content}`, shortTerms);
}

export function pdfRowMatchesShortTerms(row: WorkspacePdfSearchRow, shortTerms: string[]) {
  return hasAllSearchTerms(row.text, shortTerms);
}

export function crossPagePdfRowMatchesShortTerms(row: WorkspacePdfCrossPageSearchRow, shortTerms: string[]) {
  return hasAllSearchTerms(`${row.text} ${row.next_text}`, shortTerms);
}

export function loadShortTermNodeRows(driver: DatabaseDriver, shortTerms: string[]) {
  const bodySql = buildNodeBodyContentSql();
  const clauses = shortTerms.map(() => `instr(lower(COALESCE(n.title, '') || ' ' || ${bodySql}), ?) > 0`);
  return driver.queryAll<WorkspaceSearchRow>(
    `${VISIBLE_NODES_CTE_SQL}
SELECT n.id, n.title, ${bodySql} AS content, n.updated_at, 200 AS rank
  FROM nodes n
  INNER JOIN visible_nodes visible
    ON visible.id = n.id
  LEFT JOIN content_blob_data cbd
    ON cbd.hash = n.body_blob_hash
  WHERE ${clauses.join(' AND ')}
  ORDER BY n.updated_at DESC`,
    shortTerms
  );
}

export function loadShortTermPdfRows(driver: DatabaseDriver, shortTerms: string[]) {
  const clauses = shortTerms.map(() => `instr(lower(ppt.text), ?) > 0`);
  return driver.queryAll<WorkspacePdfSearchRow>(
    `${VISIBLE_NODES_CTE_SQL}
SELECT
  a.node_id AS id,
  COALESCE(NULLIF(trim(a.original_name), ''), 'PDF Document') AS title,
  ppt.text AS text,
  ppt.page AS page,
  length(ppt.text) AS page_text_length,
  n.updated_at AS updated_at,
  a.id AS attachment_id,
  200 AS rank
FROM pdf_page_text ppt
INNER JOIN (${NODE_PDF_RESOURCES_SQL}) a ON a.id = ppt.attachment_id
INNER JOIN nodes n ON n.id = a.node_id
INNER JOIN visible_nodes visible ON visible.id = n.id
WHERE a.mime_type = 'application/pdf'
  AND a.pdf_index_status = 'ready'
  AND ${clauses.join(' AND ')}
ORDER BY n.updated_at DESC`,
    shortTerms
  );
}
