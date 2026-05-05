import type { DatabaseDriver } from './driver.js';
import { buildCrossPagePdfExcerpt } from './pdfCrossPageWorkspaceSearch.js';
import {
  CONTENT_FALLBACK_SQL,
  MAX_RESULTS,
  NODE_FTS_SQL,
  PDF_CROSS_PAGE_MATCH_SQL,
  PDF_FALLBACK_SQL,
  PDF_FTS_SQL,
  TITLE_FALLBACK_SQL,
  type WorkspacePdfCrossPageSearchRow,
  type WorkspacePdfSearchRow,
  type WorkspaceSearchRow
} from './workspaceSearchSql.js';

interface RankedWorkspaceSearchResult extends WorkspaceSearchResult {
  rank: number;
}

const EXCERPT_PADDING = 36;
const EXCERPT_LENGTH = 96;

export interface WorkspaceSearchResult {
  excerpt: string;
  id: string;
  kind: 'node' | 'pdf';
  nodeMatch: {
    from: number;
    query: string;
    to: number;
  } | null;
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

function sortAndLimitResults(results: RankedWorkspaceSearchResult[]) {
  return results
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, MAX_RESULTS)
    .map((result) => ({
      excerpt: result.excerpt,
      id: result.id,
      kind: result.kind,
      nodeMatch: result.nodeMatch,
      pdfMatch: result.pdfMatch,
      title: result.title,
      updatedAt: result.updatedAt
    }));
}

function resolveNodeContentMatch(content: string, query: string) {
  const matchStart = content.toLowerCase().indexOf(query);
  return matchStart < 0 ? null : { from: matchStart, query, to: matchStart + query.length };
}

function toFiniteRank(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function buildNodeResult(row: WorkspaceSearchRow, query: string): RankedWorkspaceSearchResult {
  return {
    excerpt: buildExcerpt(row.content, query),
    id: row.id,
    kind: 'node',
    nodeMatch: resolveNodeContentMatch(row.content, query),
    pdfMatch: null,
    rank: toFiniteRank(row.rank, 1000),
    title: row.title.trim() || 'Untitled',
    updatedAt: row.updated_at
  };
}

function buildPdfResult(row: WorkspacePdfSearchRow, query: string): RankedWorkspaceSearchResult | null {
  const page = Number.parseInt(row.page, 10) || 0;
  const pageTextLength = Number.parseInt(row.page_text_length, 10) || 0;
  const matchStart = row.text.toLowerCase().indexOf(query);
  if (matchStart < 0) {
    return null;
  }
  return {
    excerpt: buildPdfExcerpt(row.text, query, page),
    id: row.id,
    kind: 'pdf',
    nodeMatch: null,
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

function buildCrossPagePdfResult(row: WorkspacePdfCrossPageSearchRow, query: string): RankedWorkspaceSearchResult {
  return {
    excerpt: buildCrossPagePdfExcerpt(row.text, row.next_text, row.match_start, query, row.page, row.end_page),
    id: row.id,
    kind: 'pdf',
    nodeMatch: null,
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

function loadFallbackNodeMatches(driver: DatabaseDriver, query: string) {
  const titleMatches = driver.queryAll<WorkspaceSearchRow>(TITLE_FALLBACK_SQL, [query, MAX_RESULTS]).map((row) => ({
    ...buildNodeResult({ ...row, rank: 10 }, query),
    rank: 10
  }));
  const remaining = MAX_RESULTS - titleMatches.length;
  const contentMatches =
    remaining <= 0
      ? []
      : driver.queryAll<WorkspaceSearchRow>(CONTENT_FALLBACK_SQL, [query, query, remaining]).map((row) => ({
          ...buildNodeResult({ ...row, rank: 100 }, query),
          rank: 100
        }));
  return [...titleMatches, ...contentMatches];
}

function loadFallbackPdfMatches(driver: DatabaseDriver, query: string) {
  return driver.queryAll<WorkspacePdfSearchRow>(PDF_FALLBACK_SQL, [query, MAX_RESULTS]).map((row) => ({
    ...buildPdfResult({ ...row, rank: 100 }, query),
    rank: 100
  })).filter((result): result is RankedWorkspaceSearchResult => result !== null);
}

function loadFtsNodeMatches(driver: DatabaseDriver, query: string) {
  return driver.queryAll<WorkspaceSearchRow>(NODE_FTS_SQL, [query, MAX_RESULTS]).map((row) => buildNodeResult(row, query));
}

function loadFtsPdfMatches(driver: DatabaseDriver, query: string) {
  return driver.queryAll<WorkspacePdfSearchRow>(PDF_FTS_SQL, [query, MAX_RESULTS]).map((row) => buildPdfResult(row, query)).filter((result): result is RankedWorkspaceSearchResult => result !== null);
}

function loadCrossPagePdfMatches(driver: DatabaseDriver, query: string) {
  if (query.length <= 1) {
    return [];
  }
  const tailLength = query.length - 1;
  return driver
    .queryAll<WorkspacePdfCrossPageSearchRow>(PDF_CROSS_PAGE_MATCH_SQL, [tailLength, tailLength, tailLength, tailLength, tailLength, query, query, MAX_RESULTS])
    .map((row) => buildCrossPagePdfResult(row, query));
}

export function searchWorkspace(driver: DatabaseDriver, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }
  const results =
    normalizedQuery.length <= 2
      ? [...loadFallbackNodeMatches(driver, normalizedQuery), ...loadFallbackPdfMatches(driver, normalizedQuery)]
      : [...loadFtsNodeMatches(driver, normalizedQuery), ...loadFtsPdfMatches(driver, normalizedQuery), ...loadCrossPagePdfMatches(driver, normalizedQuery)];
  return sortAndLimitResults(results);
}
