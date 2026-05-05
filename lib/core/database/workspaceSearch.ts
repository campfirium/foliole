import type { DatabaseDriver, DatabaseRow } from './driver.js';

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

export function searchWorkspace(driver: DatabaseDriver, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const titleMatches = driver.queryAll<WorkspaceSearchRow>(TITLE_MATCH_SQL, [normalizedQuery, MAX_RESULTS]).map((row) => ({
      excerpt: buildExcerpt(row.content, normalizedQuery),
      id: row.id,
      kind: 'node' as const,
      pdfMatch: null,
      title: row.title.trim() || 'Untitled',
      updatedAt: row.updated_at
    }));

  const remainingResults = MAX_RESULTS - titleMatches.length;
  const contentMatches =
    remainingResults <= 0
      ? []
      : driver
          .queryAll<WorkspaceSearchRow>(CONTENT_MATCH_SQL, [normalizedQuery, normalizedQuery, remainingResults])
          .map((row) => ({
            excerpt: buildExcerpt(row.content, normalizedQuery),
            id: row.id,
            kind: 'node' as const,
            pdfMatch: null,
            title: row.title.trim() || 'Untitled',
            updatedAt: row.updated_at
          }));

  const pdfResults = driver.queryAll<WorkspacePdfSearchRow>(PDF_MATCH_SQL, [normalizedQuery, normalizedQuery, MAX_RESULTS]).map((row) => ({
    excerpt: buildPdfExcerpt(row.text, row.match_start, normalizedQuery, row.page),
    id: row.id,
    kind: 'pdf' as const,
    pdfMatch: {
      attachmentId: row.attachment_id,
      matchStart: Math.max(0, row.match_start),
      page: row.page,
      pageTextLength: Math.max(0, row.page_text_length),
      query: normalizedQuery
    },
    title: row.title.trim() || 'PDF Document',
    updatedAt: row.updated_at
  }));

  return sortAndLimitResults([...titleMatches, ...contentMatches, ...pdfResults]);
}
