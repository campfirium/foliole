import type { DatabaseRow } from './driver.js';
import { buildNodeBodyContentSql } from './nodeBodyResolution.js';
import { VISIBLE_NODES_CTE_SQL } from './workspaceVisibleNodesSql.js';

export interface WorkspaceSearchRow extends DatabaseRow {
  content: string;
  id: string;
  path: string;
  rank: number;
  title: string;
  updated_at: string;
}

export interface WorkspacePdfSearchRow extends DatabaseRow {
  attachment_id: string;
  id: string;
  page: string;
  page_text_length: string;
  path: string;
  rank: number;
  text: string;
  title: string;
  updated_at: string;
}

export interface WorkspacePdfCrossPageSearchRow extends DatabaseRow {
  attachment_id: string;
  end_page: number;
  id: string;
  match_start: number;
  next_text: string;
  page: number;
  page_text_length: number;
  text: string;
  title: string;
  updated_at: string;
}

export const MAX_RESULTS = 40;
const NODE_BODY_CONTENT_SQL = buildNodeBodyContentSql();
export const TITLE_FALLBACK_SQL = `${VISIBLE_NODES_CTE_SQL}
SELECT n.id, n.title, ${NODE_BODY_CONTENT_SQL} AS content, n.updated_at
  FROM nodes n
  INNER JOIN visible_nodes visible
    ON visible.id = n.id
  LEFT JOIN content_blob_data cbd
    ON cbd.hash = n.body_blob_hash
  WHERE instr(lower(trim(n.title)), ?) > 0
  ORDER BY n.updated_at DESC
  LIMIT ?`;
export const CONTENT_FALLBACK_SQL = `${VISIBLE_NODES_CTE_SQL}
SELECT n.id, n.title, ${NODE_BODY_CONTENT_SQL} AS content, n.updated_at
  FROM nodes n
  INNER JOIN visible_nodes visible
    ON visible.id = n.id
  LEFT JOIN content_blob_data cbd
    ON cbd.hash = n.body_blob_hash
  WHERE instr(lower(trim(n.title)), ?) = 0
    AND instr(lower(${NODE_BODY_CONTENT_SQL}), ?) > 0
  ORDER BY n.updated_at DESC
  LIMIT ?`;
export const NODE_FTS_SQL = `${VISIBLE_NODES_CTE_SQL}
SELECT node_search.node_id AS id, title, path, content, updated_at, bm25(node_search, 8.0, 2.0, 1.0) AS rank
  FROM search.node_search AS node_search
  INNER JOIN visible_nodes visible
    ON visible.id = node_search.node_id
  WHERE node_search MATCH ?
  ORDER BY rank ASC, updated_at DESC
  LIMIT ?`;
export const PDF_FTS_SQL = `${VISIBLE_NODES_CTE_SQL}
SELECT
  pdf_search.node_id AS id,
  title,
  path,
  text,
  attachment_id,
  page,
  updated_at,
  page_text_length,
  bm25(pdf_search, 4.0, 2.0, 1.0) AS rank
FROM search.pdf_search AS pdf_search
INNER JOIN visible_nodes visible
  ON visible.id = pdf_search.node_id
WHERE pdf_search MATCH ?
ORDER BY rank ASC, updated_at DESC
LIMIT ?`;
export const PDF_FALLBACK_SQL = `${VISIBLE_NODES_CTE_SQL}
SELECT
  na.node_id AS id,
  COALESCE(NULLIF(trim(a.original_name), ''), 'PDF Document') AS title,
  ppt.text AS text,
  ppt.page AS page,
  length(ppt.text) AS page_text_length,
  n.updated_at AS updated_at,
  a.id AS attachment_id
FROM pdf_page_text ppt
INNER JOIN attachments a ON a.id = ppt.attachment_id
INNER JOIN node_attachments na ON na.attachment_id = a.id AND na.role = 'reference'
INNER JOIN nodes n ON n.id = na.node_id
INNER JOIN visible_nodes visible ON visible.id = n.id
WHERE a.mime_type = 'application/pdf'
  AND a.pdf_index_status = 'ready'
  AND instr(lower(ppt.text), ?) > 0
ORDER BY n.updated_at DESC
LIMIT ?`;
export const PDF_CROSS_PAGE_MATCH_SQL = `${VISIBLE_NODES_CTE_SQL},
page_pairs AS (
  SELECT
    na.node_id AS id,
    COALESCE(NULLIF(trim(a.original_name), ''), 'PDF Document') AS title,
    ppt.text AS text,
    next_ppt.text AS next_text,
    ppt.page AS page,
    next_ppt.page AS end_page,
    length(ppt.text) AS page_text_length,
    n.updated_at AS updated_at,
    a.id AS attachment_id,
    CASE
      WHEN length(ppt.text) > ? THEN length(ppt.text) - ?
      ELSE 0
    END AS tail_start,
    substr(ppt.text, CASE WHEN length(ppt.text) - ? + 1 > 1 THEN length(ppt.text) - ? + 1 ELSE 1 END)
      || substr(next_ppt.text, 1, ?) AS boundary_text
  FROM pdf_page_text ppt
  INNER JOIN pdf_page_text next_ppt ON next_ppt.attachment_id = ppt.attachment_id AND next_ppt.page = ppt.page + 1
  INNER JOIN attachments a ON a.id = ppt.attachment_id
  INNER JOIN node_attachments na ON na.attachment_id = a.id AND na.role = 'reference'
  INNER JOIN nodes n ON n.id = na.node_id
  INNER JOIN visible_nodes visible ON visible.id = n.id
  WHERE a.mime_type = 'application/pdf'
    AND a.pdf_index_status = 'ready'
)
SELECT
  id,
  title,
  text,
  next_text,
  page,
  end_page,
  instr(lower(boundary_text), ?) - 1 + tail_start AS match_start,
  page_text_length,
  updated_at,
  attachment_id
FROM page_pairs
WHERE instr(lower(boundary_text), ?) > 0
ORDER BY updated_at DESC
LIMIT ?`;
