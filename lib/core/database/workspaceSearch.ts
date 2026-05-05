import type { DatabaseDriver, DatabaseRow } from './driver.js';

interface WorkspaceSearchRow extends DatabaseRow {
  content: string;
  id: string;
  title: string;
}

const EXCERPT_PADDING = 36;
const EXCERPT_LENGTH = 96;
const MAX_RESULTS = 40;
const TITLE_MATCH_SQL = `SELECT id, title, content
  FROM nodes
  WHERE deleted_at IS NULL
    AND instr(lower(trim(title)), ?) > 0
  ORDER BY updated_at DESC
  LIMIT ?`;
const CONTENT_MATCH_SQL = `SELECT id, title, content
  FROM nodes
  WHERE deleted_at IS NULL
    AND instr(lower(trim(title)), ?) = 0
    AND instr(lower(content), ?) > 0
  ORDER BY updated_at DESC
  LIMIT ?`;

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

export function searchWorkspace(driver: DatabaseDriver, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const titleMatches = driver.queryAll<WorkspaceSearchRow>(TITLE_MATCH_SQL, [normalizedQuery, MAX_RESULTS]).map((row) => ({
      excerpt: buildExcerpt(row.content, normalizedQuery),
      id: row.id,
      title: row.title.trim() || 'Untitled'
    }));

  const remainingResults = MAX_RESULTS - titleMatches.length;
  if (remainingResults <= 0) {
    return titleMatches;
  }

  const contentMatches = driver
    .queryAll<WorkspaceSearchRow>(CONTENT_MATCH_SQL, [normalizedQuery, normalizedQuery, remainingResults])
    .map((row) => ({
      excerpt: buildExcerpt(row.content, normalizedQuery),
      id: row.id,
      title: row.title.trim() || 'Untitled'
    }));

  return [...titleMatches, ...contentMatches].slice(0, MAX_RESULTS);
}
