import { buildFtsSearchQueryPlan } from '../../lib/core/database/ftsSearchQuery.js';

import {
  isExternalDocumentVisible,
  loadActiveImportedSourceLocatorNodeIds,
  loadActiveImportedSourceLocators,
  resolveImportedNodeIdForExternalDocument
} from './externalDocumentImportVisibility.js';
import { openExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { type ExternalSearchRow, toExternalResult } from './externalSearchCacheSupport.js';
import {
  mergeExternalSearchRows,
  readAdvancedExternalSearchRows,
  readExternalSearchFtsRows
} from './externalSearchQueryRows.js';
import { searchReadwiseExternalDocuments } from './readwiseManagedExternalDocuments.js';

function readShortExternalSearchRows(db: import('better-sqlite3').Database, normalizedQuery: string) {
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
        1000 AS rank
       FROM external_search_documents
       WHERE is_present = 1
         AND (instr(lower(file_name), ?) > 0
          OR instr(lower(relative_path), ?) > 0
          OR instr(lower(content), ?) > 0)
       ORDER BY modified_ms DESC
       LIMIT 20`
    )
    .all(normalizedQuery, normalizedQuery, normalizedQuery) as ExternalSearchRow[];
}

export function searchExternalDocuments(query: string) {
  const db = openExternalSearchCacheDatabase();
  const queryPlan = buildFtsSearchQueryPlan(query);
  const normalizedQuery = queryPlan.normalizedQuery;
  if (!normalizedQuery) {
    return [];
  }
  const rows =
    normalizedQuery.length <= 2
      ? readShortExternalSearchRows(db, normalizedQuery)
      : mergeExternalSearchRows([
          ...readExternalSearchFtsRows(db, queryPlan.literalQuery),
          ...readAdvancedExternalSearchRows(db, queryPlan.advancedQuery)
        ]);
  const activeImportedLocators = loadActiveImportedSourceLocators();
  const importedNodeIdsByLocator = loadActiveImportedSourceLocatorNodeIds();
  return [
    ...rows
      .filter((row) => isExternalDocumentVisible(row.absolute_path, activeImportedLocators))
      .map((row) =>
        toExternalResult(row, queryPlan.highlightQuery, resolveImportedNodeIdForExternalDocument(row.absolute_path, importedNodeIdsByLocator))
      ),
    ...searchReadwiseExternalDocuments(queryPlan)
  ];
}
