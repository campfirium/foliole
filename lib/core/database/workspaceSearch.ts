import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { buildCrossPagePdfExcerpt } from './pdfCrossPageWorkspaceSearch.js';

interface WorkspaceSearchRow extends DatabaseRow {
  content: string;
  id: string;
  title: string;
  updated_at: string;
}

interface WorkspacePdfSearchRow extends DatabaseRow {
  attachment_id: string;
  id: string;
  match_start: number;
  page: number;
  page_text_length: number;
  text: string;
  title: string;
  updated_at: string;
}

interface WorkspacePdfCrossPageSearchRow extends DatabaseRow {
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

const EXCERPT_PADDING = 36;
const EXCERPT_LENGTH = 96;
const MAX_RESULTS = 40;
const TITLE_MATCH_SQL = `SELECT id, title, content
  , updated_at
  FROM nodes
  WHERE deleted_at IS NULL
    AND instr(lower(trim(title)), ?) > 0
  ORDER BY updated_at DESC
  LIMIT ?`;
const CONTENT_MATCH_SQL = `SELECT id, title, content
  , updated_at
  FROM nodes
  WHERE deleted_at IS NULL
    AND instr(lower(trim(title)), ?) = 0
    AND instr(lower(content), ?) > 0
  ORDER BY updated_at DESC
  LIMIT ?`;
const PDF_MATCH_SQL = `SELECT
  na.node_id AS id,
  COALESCE(NULLIF(trim(a.original_name), ''), 'PDF Document') AS title,
  ppt.text AS text,
  ppt.page AS page,
  instr(lower(ppt.text), ?) - 1 AS match_start,
  length(ppt.text) AS page_text_length,
  n.updated_at AS updated_at,
  a.id AS attachment_id
FROM pdf_page_text ppt
INNER JOIN attachments a ON a.id = ppt.attachment_id
INNER JOIN node_attachments na ON na.attachment_id = a.id AND na.role = 'reference'
INNER JOIN nodes n ON n.id = na.node_id
WHERE n.deleted_at IS NULL
  AND a.mime_type = 'application/pdf'
  AND a.pdf_index_status = 'ready'
  AND instr(lower(ppt.text), ?) > 0
ORDER BY n.updated_at DESC
LIMIT ?`;
const PDF_CROSS_PAGE_MATCH_SQL = `WITH page_pairs AS (
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
  WHERE n.deleted_at IS NULL
    AND a.mime_type = 'application/pdf'
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

export interface WorkspaceSearchResult {
  excerpt: string;
  id: string;
  kind: 'node' | 'pdf';
  pdfMatch: {
    attachmentId: string;
    matchStart: number;
    page: number;
    pageTextLength: number;
    query: string;
  } | null;
  title: string;
  updatedAt: string;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function buildExcerpt(content: string, query: string) {
  const normalizedContent = normalizeWhitespace(content);
  if (!normalizedContent) {
    return 'No content preview';
  }

  const normalizedQuery = query.trim().toLowerCase();
  const matchIndex = normalizedContent.toLowerCase().indexOf(normalizedQuery);
  if (matchIndex === -1) {
    return normalizedContent.slice(0, EXCERPT_LENGTH);
  }

  const start = Math.max(0, matchIndex - EXCERPT_PADDING);
  const end = Math.min(normalizedContent.length, matchIndex + normalizedQuery.length + EXCERPT_PADDING);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalizedContent.length ? '...' : '';
  return `${prefix}${normalizedContent.slice(start, end)}${suffix}`;
}

function buildPdfExcerpt(content: string, matchStart: number, query: string, page: number) {
  const normalizedContent = normalizeWhitespace(content);
  if (!normalizedContent) {
    return `Page ${page}`;
  }
  const fallbackMatchStart = normalizedContent.toLowerCase().indexOf(query);
  const safeMatchStart = matchStart >= 0 ? matchStart : fallbackMatchStart;
  if (safeMatchStart < 0) {
    return `Page ${page} · ${normalizedContent.slice(0, EXCERPT_LENGTH)}`;
  }
  const start = Math.max(0, safeMatchStart - EXCERPT_PADDING);
  const end = Math.min(normalizedContent.length, safeMatchStart + query.length + EXCERPT_PADDING);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalizedContent.length ? '...' : '';
  return `Page ${page} · ${prefix}${normalizedContent.slice(start, end)}${suffix}`;
}

function sortAndLimitResults(results: WorkspaceSearchResult[]) {
  return results
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_RESULTS);
}

function buildNodeSearchResult(row: WorkspaceSearchRow, query: string): WorkspaceSearchResult {
  return {
    excerpt: buildExcerpt(row.content, query),
    id: row.id,
    kind: 'node',
    pdfMatch: null,
    title: row.title.trim() || 'Untitled',
    updatedAt: row.updated_at
  };
}

function buildPdfSearchResult(row: WorkspacePdfSearchRow, query: string): WorkspaceSearchResult {
  return {
    excerpt: buildPdfExcerpt(row.text, row.match_start, query, row.page),
    id: row.id,
    kind: 'pdf',
    pdfMatch: {
      attachmentId: row.attachment_id,
      matchStart: Math.max(0, row.match_start),
      page: row.page,
      pageTextLength: Math.max(0, row.page_text_length),
      query
    },
    title: row.title.trim() || 'PDF Document',
    updatedAt: row.updated_at
  };
}

function buildCrossPagePdfSearchResult(row: WorkspacePdfCrossPageSearchRow, query: string): WorkspaceSearchResult {
  return {
    excerpt: buildCrossPagePdfExcerpt(row.text, row.next_text, row.match_start, query, row.page, row.end_page),
    id: row.id,
    kind: 'pdf',
    pdfMatch: {
      attachmentId: row.attachment_id,
      matchStart: Math.max(0, row.match_start),
      page: row.page,
      pageTextLength: Math.max(0, row.page_text_length),
      query
    },
    title: row.title.trim() || 'PDF Document',
    updatedAt: row.updated_at
  };
}

function loadNodeMatches(driver: DatabaseDriver, query: string) {
  const titleMatches = driver.queryAll<WorkspaceSearchRow>(TITLE_MATCH_SQL, [query, MAX_RESULTS]).map((row) => buildNodeSearchResult(row, query));
  const remainingResults = MAX_RESULTS - titleMatches.length;
  const contentMatches =
    remainingResults <= 0
      ? []
      : driver.queryAll<WorkspaceSearchRow>(CONTENT_MATCH_SQL, [query, query, remainingResults]).map((row) => buildNodeSearchResult(row, query));
  return [...titleMatches, ...contentMatches];
}

function loadPdfMatches(driver: DatabaseDriver, query: string) {
  return driver.queryAll<WorkspacePdfSearchRow>(PDF_MATCH_SQL, [query, query, MAX_RESULTS]).map((row) => buildPdfSearchResult(row, query));
}

function loadCrossPagePdfMatches(driver: DatabaseDriver, query: string) {
  if (query.length <= 1) {
    return [];
  }
  const tailLength = query.length - 1;
  return driver
    .queryAll<WorkspacePdfCrossPageSearchRow>(PDF_CROSS_PAGE_MATCH_SQL, [tailLength, tailLength, tailLength, tailLength, tailLength, query, query, MAX_RESULTS])
    .map((row) => buildCrossPagePdfSearchResult(row, query));
}

export function searchWorkspace(driver: DatabaseDriver, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return sortAndLimitResults([
    ...loadNodeMatches(driver, normalizedQuery),
    ...loadPdfMatches(driver, normalizedQuery),
    ...loadCrossPagePdfMatches(driver, normalizedQuery)
  ]);
}
