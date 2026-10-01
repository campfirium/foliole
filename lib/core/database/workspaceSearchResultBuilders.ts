import { buildCrossPagePdfExcerpt } from './pdfCrossPageWorkspaceSearch.js';
import { locateSearchAliasSpans } from './searchAliasMatchContext.js';
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

export function buildExcerpt(content: string, query: string) {
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

export function buildPdfExcerpt(content: string, query: string, page: number) {
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
  pathQuality: WorkspaceSearchPathQuality,
  aliasSpellings: string[] = [],
  triggerSpellings: string[] = [],
  evidenceOwner?: object
): RankedWorkspaceSearchResult {
  const bodySpans = locateSearchAliasSpans(evidenceOwner, row.content, aliasSpellings);
  const titleSpans = locateSearchAliasSpans(evidenceOwner, `${row.title} ${row.path ?? ''}`, aliasSpellings);
  const aliasMatches = aliasSpellings.flatMap((spelling) => {
    const bodySpan = bodySpans.find((span) => span.spelling === spelling);
    const titleSpan = titleSpans.find((span) => span.spelling === spelling);
    if (!bodySpan && !titleSpan) return [];
    return [{
      excerpt: bodySpan ? buildExcerpt(row.content, bodySpan.query) : buildExcerpt(row.content, ''),
      externalMatch: null,
      nodeMatch: bodySpan ? { from: bodySpan.from, query: bodySpan.query, to: bodySpan.to } : null,
      pdfMatch: null,
      spelling
    }];
  });
  const primary = aliasMatches.find((item) => triggerSpellings.includes(item.spelling)) ?? aliasMatches[0];
  return {
    aliasMatches: aliasMatches.length ? aliasMatches : undefined,
    excerpt: primary?.excerpt ?? buildExcerpt(row.content, query),
    externalMatch: null,
    id: row.id,
    isTrashed: Boolean(row.is_trashed),
    kind: 'node',
    matchedOriginal: aliasSpellings.length ? aliasMatches.some((item) => triggerSpellings.includes(item.spelling)) : undefined,
    nodeMatch: primary?.nodeMatch ?? resolveNodeContentMatch(row.content, query),
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
  pathQuality: WorkspaceSearchPathQuality,
  aliasSpellings: string[] = [],
  triggerSpellings: string[] = [],
  evidenceOwner?: object
): RankedWorkspaceSearchResult | null {
  const page = Number.parseInt(row.page, 10) || 0;
  const pageTextLength = Number.parseInt(row.page_text_length, 10) || 0;
  const pageSpans = locateSearchAliasSpans(evidenceOwner, row.text, aliasSpellings);
  const metadataSpans = locateSearchAliasSpans(evidenceOwner, `${row.title} ${row.path ?? ''}`, aliasSpellings);
  const aliasMatches = aliasSpellings.flatMap((spelling) => {
    const span = pageSpans.find((item) => item.spelling === spelling);
    const metadata = metadataSpans.find((item) => item.spelling === spelling);
    if (!span && !metadata) return [];
    return [{
      excerpt: buildPdfExcerpt(row.text, span?.query ?? '', page),
      externalMatch: null,
      nodeMatch: null,
      pdfMatch: span ? { attachmentId: row.attachment_id, matchStart: span.from, page, pageTextLength, query: span.query } : null,
      spelling
    }];
  });
  const primary = aliasMatches.find((item) => item.pdfMatch && triggerSpellings.includes(item.spelling))
    ?? aliasMatches.find((item) => item.pdfMatch) ?? aliasMatches[0];
  const matchStart = row.text.toLowerCase().indexOf(query);
  if (matchStart < 0 && !primary) {
    return null;
  }
  return {
    aliasMatches: aliasMatches.length ? aliasMatches : undefined,
    excerpt: primary?.excerpt ?? buildPdfExcerpt(row.text, query, page),
    externalMatch: null,
    id: row.id,
    isTrashed: Boolean(row.is_trashed),
    kind: 'pdf',
    nodeMatch: null,
    matchedOriginal: aliasSpellings.length ? aliasMatches.some((item) => triggerSpellings.includes(item.spelling)) : undefined,
    pathQuality,
    pdfMatch: primary ? primary.pdfMatch : {
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
    isTrashed: Boolean(row.is_trashed),
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
