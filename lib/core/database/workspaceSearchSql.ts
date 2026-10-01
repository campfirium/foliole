import type { DatabaseRow } from './driver.js';

export interface WorkspaceSearchRow extends DatabaseRow {
  content: string;
  id: string;
  path: string;
  rank: number;
  title: string;
  updated_at: string;
  is_trashed?: number;
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
  is_trashed?: number;
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
  is_trashed?: number;
}

export const NODE_INDEX_COLUMNS = 'node_id AS id, title, path, content, updated_at, is_trashed';
export const PDF_INDEX_COLUMNS = 'node_id AS id, title, path, text, attachment_id, page, updated_at, page_text_length, is_trashed';
export const TITLE_FALLBACK_SQL = `SELECT ${NODE_INDEX_COLUMNS} FROM search.node_search
  WHERE instr(lower(trim(title)), ?) > 0 ORDER BY updated_at DESC`;
export const CONTENT_FALLBACK_SQL = `SELECT ${NODE_INDEX_COLUMNS} FROM search.node_search
  WHERE instr(lower(trim(title)), ?) = 0 AND instr(lower(content), ?) > 0 ORDER BY updated_at DESC`;
export const NODE_FTS_SQL = `SELECT ${NODE_INDEX_COLUMNS}, bm25(node_search, 8.0, 2.0, 1.0) AS rank
  FROM search.node_search WHERE node_search MATCH ? ORDER BY rank ASC, updated_at DESC`;
export const PDF_FTS_SQL = `SELECT ${PDF_INDEX_COLUMNS}, bm25(pdf_search, 4.0, 2.0, 1.0) AS rank
  FROM search.pdf_search WHERE pdf_search MATCH ? ORDER BY rank ASC, updated_at DESC`;
export const PDF_FALLBACK_SQL = `SELECT ${PDF_INDEX_COLUMNS} FROM search.pdf_search
  WHERE instr(lower(text), ?) > 0 ORDER BY updated_at DESC`;
export const PDF_CROSS_PAGE_MATCH_SQL = `WITH page_pairs AS (
  SELECT p.node_id AS id, p.title, p.text, next.text AS next_text,
    CAST(p.page AS INTEGER) AS page, CAST(next.page AS INTEGER) AS end_page,
    CAST(p.page_text_length AS INTEGER) AS page_text_length, p.updated_at, p.attachment_id, p.is_trashed,
    CASE WHEN length(p.text) > ? THEN length(p.text) - ? ELSE 0 END AS tail_start,
    substr(p.text, CASE WHEN length(p.text) - ? + 1 > 1 THEN length(p.text) - ? + 1 ELSE 1 END)
      || substr(next.text, 1, ?) AS boundary_text
  FROM search.pdf_search p INNER JOIN search.pdf_page_map current ON current.row_id = p.rowid
    INNER JOIN search.pdf_page_map neighbor
      ON neighbor.node_id = current.node_id AND neighbor.attachment_id = current.attachment_id
        AND neighbor.page = current.page + 1
    INNER JOIN search.pdf_search next ON next.rowid = neighbor.row_id
)
SELECT id, title, text, next_text, page, end_page,
  instr(lower(boundary_text), ?) - 1 + tail_start AS match_start,
  page_text_length, updated_at, attachment_id, is_trashed
FROM page_pairs WHERE instr(lower(boundary_text), ?) > 0 ORDER BY updated_at DESC`;
