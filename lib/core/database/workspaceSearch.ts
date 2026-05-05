import type { DatabaseDriver, DatabaseRow } from './driver.js';

interface WorkspaceSearchRow extends DatabaseRow {
  content: string;
  deleted_at: string | null;
  id: string;
  title: string;
}

const EXCERPT_PADDING = 36;
const EXCERPT_LENGTH = 96;
const MAX_RESULTS = 40;

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

  const rows = driver.queryAll<WorkspaceSearchRow>('SELECT id, title, content, deleted_at FROM nodes');
  const titleMatches: Array<{ excerpt: string; id: string; title: string }> = [];
  const contentMatches: Array<{ excerpt: string; id: string; title: string }> = [];

  for (const row of rows) {
    if (row.deleted_at) {
      continue;
    }
    const normalizedTitle = row.title.trim().toLowerCase();
    const contentMatch = row.content.toLowerCase().includes(normalizedQuery);
    const titleMatch = normalizedTitle.includes(normalizedQuery);
    if (!titleMatch && !contentMatch) {
      continue;
    }
    const result = {
      excerpt: buildExcerpt(row.content, normalizedQuery),
      id: row.id,
      title: row.title.trim() || 'Untitled'
    };
    if (titleMatch) {
      titleMatches.push(result);
    } else {
      contentMatches.push(result);
    }
    if (titleMatches.length + contentMatches.length >= MAX_RESULTS) {
      break;
    }
  }

  return [...titleMatches, ...contentMatches].slice(0, MAX_RESULTS);
}
