import type { ExternalSearchRow } from './externalSearchCacheSupport.js';

type SqliteDatabase = import('better-sqlite3').Database;

export function readExternalSearchFtsRows(db: SqliteDatabase, ftsQuery: string) {
  return db
    .prepare(
      `SELECT
        absolute_path,
        file_name,
        folder_id,
        folder_path,
        relative_path,
        content AS text,
        modified_at,
        bm25(external_search_fts, 8.0, 5.0, 3.0, 1.0) AS rank
       FROM external_search_fts
       WHERE external_search_fts MATCH ?
       ORDER BY rank ASC, modified_at DESC
       LIMIT 20`
    )
    .all(ftsQuery) as ExternalSearchRow[];
}

export function readAdvancedExternalSearchRows(db: SqliteDatabase, advancedQuery: string | null) {
  if (!advancedQuery) {
    return [];
  }
  try {
    return readExternalSearchFtsRows(db, advancedQuery);
  } catch {
    return [];
  }
}

export function mergeExternalSearchRows(rows: ExternalSearchRow[]) {
  const merged = new Map<string, ExternalSearchRow>();
  rows.forEach((row) => {
    const existing = merged.get(row.absolute_path);
    if (!existing || row.rank < existing.rank) {
      merged.set(row.absolute_path, existing ? { ...existing, rank: row.rank } : row);
    }
  });
  return [...merged.values()];
}
