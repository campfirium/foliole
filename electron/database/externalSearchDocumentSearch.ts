import { executeFtsSearchPlan } from '../../lib/core/database/ftsSearchExecution.js';
import { buildFtsSearchQueryPlan, type FtsSearchQueryPlan } from '../../lib/core/database/ftsSearchQuery.js';

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

function readExternalSearchFtsRowsSafely(db: import('better-sqlite3').Database, ftsQuery: string | null) {
  if (!ftsQuery) {
    return [];
  }
  try {
    return readExternalSearchFtsRows(db, ftsQuery);
  } catch {
    return [];
  }
}

function readTermExternalSearchRows(db: import('better-sqlite3').Database, queryPlan: FtsSearchQueryPlan) {
  const rows = readExternalSearchFtsRowsSafely(db, queryPlan.termQuery);
  if (queryPlan.shortTerms.length === 0) {
    return rows;
  }
  return rows.filter((row) => queryPlan.shortTerms.every((term) =>
    `${row.file_name} ${row.relative_path} ${row.text}`.toLowerCase().includes(term)
  ));
}

function readPairExternalSearchRows(db: import('better-sqlite3').Database, queryPlan: FtsSearchQueryPlan) {
  return queryPlan.pairQueries.flatMap((pairQuery) => readExternalSearchFtsRowsSafely(db, pairQuery));
}

function readShortTermExternalSearchRows(db: import('better-sqlite3').Database, queryPlan: FtsSearchQueryPlan) {
  if (queryPlan.ftsTerms.length >= 2 || queryPlan.shortTerms.length === 0) {
    return [];
  }
  const clauses = queryPlan.shortTerms.map(() =>
    `instr(lower(file_name || ' ' || relative_path || ' ' || content), ?) > 0`
  );
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
        950 AS rank
       FROM external_search_documents
       WHERE is_present = 1
         AND ${clauses.join(' AND ')}
       ORDER BY modified_ms DESC
       LIMIT 20`
    )
    .all(...queryPlan.shortTerms) as ExternalSearchRow[];
}

function readCombinedTermFallbackExternalSearchRows(db: import('better-sqlite3').Database, queryPlan: FtsSearchQueryPlan) {
  if (queryPlan.advancedQuery) {
    return [];
  }
  const terms = [...queryPlan.ftsTerms, ...queryPlan.shortTerms];
  if (terms.length <= 1) {
    return [];
  }
  const clauses = terms.map(() =>
    `instr(lower(file_name || ' ' || relative_path || ' ' || content), ?) > 0`
  );
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
        925 AS rank
       FROM external_search_documents
       WHERE is_present = 1
         AND ${clauses.join(' AND ')}
       ORDER BY modified_ms DESC
       LIMIT 20`
    )
    .all(...terms) as ExternalSearchRow[];
}

export function searchExternalDocuments(query: string) {
  const db = openExternalSearchCacheDatabase();
  const queryPlan = buildFtsSearchQueryPlan(query);
  const rows = executeFtsSearchPlan(query, {
    finalizeResults: (results) => results,
    loadAdvancedMatches: (plan) => readAdvancedExternalSearchRows(db, plan.advancedQuery),
    loadLiteralMatches: (plan) => readExternalSearchFtsRows(db, plan.literalQuery),
    loadPairMatches: (plan) => readPairExternalSearchRows(db, plan),
    loadPostTermFallbackMatches: (plan) => readCombinedTermFallbackExternalSearchRows(db, plan),
    loadShortQueryMatches: (plan) => readShortExternalSearchRows(db, plan.normalizedQuery),
    loadShortTermFallbackMatches: (plan) => readShortTermExternalSearchRows(db, plan),
    loadTermMatches: (plan) => readTermExternalSearchRows(db, plan),
    mergeResults: mergeExternalSearchRows
  });
  if (!queryPlan.normalizedQuery) {
    return [];
  }
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
