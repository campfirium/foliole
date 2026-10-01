import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { matchesFtsSearchFields, type FtsSearchQueryPlan } from './ftsSearchQuery.js';

export interface StoredSourceSearchRow extends DatabaseRow {
  content: string;
  metadata: string;
  source_key: string;
  title: string;
  path: string;
  updated_at: string;
}

export function searchStoredSources(driver: DatabaseDriver, kind: 'external' | 'removed', plan: FtsSearchQueryPlan) {
  if (!plan.normalizedQuery) return [];
  const terms = [...new Set([plan.normalizedQuery, ...plan.aliasSpellings,
    ...plan.queryTokens.filter((term) => !['AND', 'OR', 'NOT'].includes(term)).map((term) => term.toLowerCase())])];
  const rows = new Map<string, StoredSourceSearchRow>();
  const columns = 'title, path, content, source_key, metadata, updated_at';
  const ftsQuery = terms.map((term) => '"' + term.replaceAll('"', '""') + '"').join(' OR ');
  for (const row of driver.queryAll<StoredSourceSearchRow>(`SELECT ${columns}
    FROM stored_source_search WHERE stored_source_search MATCH ? AND kind = ?`, [ftsQuery, kind])) {
    rows.set(row.source_key, row);
  }
  const clauses = terms.map(() => "instr(lower(title || ' ' || path || ' ' || content), ?) > 0");
  for (const row of driver.queryAll<StoredSourceSearchRow>(`SELECT ${columns}
    FROM stored_source_search WHERE kind = ? AND (${clauses.join(' OR ')})`, [kind, ...terms])) {
    rows.set(row.source_key, row);
  }
  return [...rows.values()].filter((row) => matchesFtsSearchFields([row.title, row.path, row.content], plan));
}
