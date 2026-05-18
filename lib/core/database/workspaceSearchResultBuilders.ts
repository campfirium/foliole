import { buildCrossPagePdfExcerpt } from './pdfCrossPageWorkspaceSearch.js';
import type { RankedWorkspaceSearchResult, WorkspaceSearchPathQuality } from './workspaceSearchResults.js';
import type {
  WorkspacePdfCrossPageSearchRow,
  WorkspacePdfSearchRow,
  WorkspaceSearchRow
} from './workspaceSearchSql.js';

const EXCERPT_PADDING = 36;
const EXCERPT_LENGTH = 96;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function buildExcerpt(content: string, query: string) {
  const normalizedContent = normalizeWhitespace(content);
  if (!normalizedContent) {
    return 'No content preview';
  }
  const matchIndex = normalizedContent.toLowerCase().indexOf(query);
  if (matchIndex === -1) {
    return normalizedContent.slice(0, EXCERPT_LENGTH);
  }
  const start = Math.max(0, matchIndex - EXCERPT_PADDING);
  const end = Math.min(normalizedContent.length, matchIndex + query.length + EXCERPT_PADDING);
  return `${start > 0 ? '...' : ''}${normalizedContent.slice(start, end)}${end < normalizedContent.length ? '...' : ''}`;
}

function buildPdfExcerpt(content: string, query: string, page: number) {
  const normalizedContent = normalizeWhitespace(content);
  if (!normalizedContent) {
    return `Page ${page}`;
  }
  const matchStart = normalizedContent.toLowerCase().indexOf(query);
  if (matchStart < 0) {
    return `Page ${page} · ${normalizedContent.slice(0, EXCERPT_LENGTH)}`;
  }
  const start = Math.max(0, matchStart - EXCERPT_PADDING);
  const end = Math.min(normalizedContent.length, matchStart + query.length + EXCERPT_PADDING);
  return `Page ${page} · ${start > 0 ? '...' : ''}${normalizedContent.slice(start, end)}${end < normalizedContent.length ? '...' : ''}`;
}

function resolveNodeContentMatch(content: string, query: string) {
  const matchStart = content.toLowerCase().indexOf(query);
  return matchStart < 0 ? null : { from: matchStart, query, to: matchStart + query.length };
}

function toFiniteRank(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function buildNodeResult(
  row: WorkspaceSearchRow,
  query: string,
  pathQuality: WorkspaceSearchPathQuality
): RankedWorkspaceSearchResult {
  return {
    excerpt: buildExcerpt(row.content, query),
    externalMatch: null,
    id: row.id,
    kind: 'node',
    nodeMatch: resolveNodeContentMatch(row.content, query),
    pdfMatch: null,
    pathQuality,
    rank: toFiniteRank(row.rank, 1000),
    title: row.title.trim() || 'Untitled',
    updatedAt: row.updated_at
  };
}

export function buildPdfResult(
  row: WorkspacePdfSearchRow,
  query: string,
  pathQuality: WorkspaceSearchPathQuality
): RankedWorkspaceSearchResult | null {
  const page = Number.parseInt(row.page, 10) || 0;
  const pageTextLength = Number.parseInt(row.page_text_length, 10) || 0;
  const matchStart = row.text.toLowerCase().indexOf(query);
  if (matchStart < 0) {
    return null;
  }
  return {
    excerpt: buildPdfExcerpt(row.text, query, page),
    externalMatch: null,
    id: row.id,
    kind: 'pdf',
    nodeMatch: null,
    pathQuality,
    pdfMatch: {
      attachmentId: row.attachment_id,
      matchStart: Math.max(0, matchStart),
      page,
      pageTextLength,
      query
    },
    rank: toFiniteRank(row.rank, 1000),
    title: row.title.trim() || 'PDF Document',
    updatedAt: row.updated_at
  };
}

export function buildCrossPagePdfResult(row: WorkspacePdfCrossPageSearchRow, query: string): RankedWorkspaceSearchResult {
  return {
    excerpt: buildCrossPagePdfExcerpt(row.text, row.next_text, row.match_start, query, row.page, row.end_page),
    externalMatch: null,
    id: row.id,
    kind: 'pdf',
    nodeMatch: null,
    pathQuality: 'literal',
    pdfMatch: {
      attachmentId: row.attachment_id,
      matchStart: Math.max(0, row.match_start),
      page: row.page,
      pageTextLength: Math.max(0, row.page_text_length),
      query
    },
    rank: 500,
    title: row.title.trim() || 'PDF Document',
    updatedAt: row.updated_at
  };
}
