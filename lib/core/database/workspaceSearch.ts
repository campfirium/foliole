import type { DatabaseDriver } from './driver.js';
import { executeFtsSearchPlan } from './ftsSearchExecution.js';
import { matchesFtsSearchFields, type FtsSearchQueryPlan } from './ftsSearchQuery.js';
import { loadAliasFallbackWorkspaceMatches } from './workspaceSearchAliasFallback.js';
import { buildCrossPagePdfResult, buildNodeResult, buildPdfResult } from './workspaceSearchResultBuilders.js';
import {
  mergeRankedResults,
  sortAndLimitResults,
  type RankedWorkspaceSearchResult,
  type WorkspaceSearchPathQuality
} from './workspaceSearchResults.js';
import {
  crossPagePdfRowMatchesShortTerms,
  loadShortTermNodeRows,
  loadShortTermPdfRows,
  nodeRowMatchesShortTerms,
  pdfRowMatchesShortTerms
} from './workspaceSearchShortTerms.js';
import {
  CONTENT_FALLBACK_SQL,
  NODE_FTS_SQL,
  PDF_CROSS_PAGE_MATCH_SQL,
  PDF_FALLBACK_SQL,
  PDF_FTS_SQL,
  TITLE_FALLBACK_SQL,
  type WorkspacePdfCrossPageSearchRow,
  type WorkspacePdfSearchRow,
  type WorkspaceSearchRow
} from './workspaceSearchSql.js';

export type { WorkspaceSearchResult } from './workspaceSearchResults.js';

function loadFallbackNodeMatches(driver: DatabaseDriver, query: string) {
  const titleMatches = driver.queryAll<WorkspaceSearchRow>(TITLE_FALLBACK_SQL, [query]).map((row) => ({
    ...buildNodeResult({ ...row, rank: 10 }, query, 'fallback'),
    rank: 10
  }));
  const contentMatches = driver.queryAll<WorkspaceSearchRow>(CONTENT_FALLBACK_SQL, [query, query]).map((row) => ({
          ...buildNodeResult({ ...row, rank: 100 }, query, 'fallback'),
          rank: 100
        }));
  return [...titleMatches, ...contentMatches];
}

function loadFallbackPdfMatches(driver: DatabaseDriver, query: string) {
  return driver.queryAll<WorkspacePdfSearchRow>(PDF_FALLBACK_SQL, [query]).map((row) => ({
    ...buildPdfResult({ ...row, rank: 100 }, query, 'fallback'),
    rank: 100
  })).filter((result): result is RankedWorkspaceSearchResult => result !== null);
}

function loadFtsNodeMatches(
  driver: DatabaseDriver,
  ftsQuery: string,
  highlightQuery: string,
  pathQuality: WorkspaceSearchPathQuality,
  shortTerms: string[] = [],
  queryPlan?: FtsSearchQueryPlan
) {
  return driver
    .queryAll<WorkspaceSearchRow>(NODE_FTS_SQL, [ftsQuery])
    .filter((row) => (shortTerms.length === 0 || nodeRowMatchesShortTerms(row, shortTerms))
      && (!queryPlan?.expandedExpression || matchesFtsSearchFields([row.title, row.path, row.content], queryPlan)))
    .map((row) => buildNodeResult(row, highlightQuery, pathQuality, queryPlan?.aliasSpellings, queryPlan?.triggerSpellings));
}

function loadFtsPdfMatches(
  driver: DatabaseDriver,
  ftsQuery: string,
  highlightQuery: string,
  pathQuality: WorkspaceSearchPathQuality,
  shortTerms: string[] = [],
  queryPlan?: FtsSearchQueryPlan
) {
  return driver
    .queryAll<WorkspacePdfSearchRow>(PDF_FTS_SQL, [ftsQuery])
    .filter((row) => (shortTerms.length === 0 || pdfRowMatchesShortTerms(row, shortTerms))
      && (!queryPlan?.expandedExpression || matchesFtsSearchFields([row.title, row.path, row.text], queryPlan)))
    .map((row) => buildPdfResult(row, highlightQuery, pathQuality, queryPlan?.aliasSpellings, queryPlan?.triggerSpellings))
    .filter((result): result is RankedWorkspaceSearchResult => result !== null);
}

function loadCrossPagePdfMatches(driver: DatabaseDriver, query: string, shortTerms: string[] = []) {
  if (query.length <= 1) {
    return [];
  }
  const tailLength = query.length - 1;
  return driver
    .queryAll<WorkspacePdfCrossPageSearchRow>(PDF_CROSS_PAGE_MATCH_SQL, [tailLength, tailLength, tailLength, tailLength, tailLength, query, query])
    .filter((row) => shortTerms.length === 0 || crossPagePdfRowMatchesShortTerms(row, shortTerms))
    .map((row) => buildCrossPagePdfResult(row, query));
}

function loadAdvancedFtsWorkspaceMatches(driver: DatabaseDriver, queryPlan: FtsSearchQueryPlan) {
  if (!queryPlan.advancedQuery) {
    return [];
  }
  try {
    return [
      ...loadFtsNodeMatches(driver, queryPlan.advancedQuery, queryPlan.highlightQuery, 'term', [], queryPlan),
      ...loadFtsPdfMatches(driver, queryPlan.advancedQuery, queryPlan.highlightQuery, 'term', [], queryPlan)
    ];
  } catch {
    return [];
  }
}

function loadTermFtsWorkspaceMatches(driver: DatabaseDriver, queryPlan: FtsSearchQueryPlan) {
  if (!queryPlan.termQuery) {
    return [];
  }
  try {
    return [
      ...loadFtsNodeMatches(driver, queryPlan.termQuery, queryPlan.ftsTerms[0] ?? queryPlan.highlightQuery, 'term', queryPlan.shortTerms),
      ...loadFtsPdfMatches(driver, queryPlan.termQuery, queryPlan.ftsTerms[0] ?? queryPlan.highlightQuery, 'term', queryPlan.shortTerms)
    ];
  } catch {
    return [];
  }
}

function loadPairFtsWorkspaceMatches(driver: DatabaseDriver, queryPlan: FtsSearchQueryPlan) {
  return queryPlan.pairQueries.flatMap((pairQuery, index) => {
    const highlightQuery = queryPlan.pairPhrases[index] ?? queryPlan.highlightQuery;
    try {
      return [
        ...loadFtsNodeMatches(driver, pairQuery, highlightQuery, 'pair', queryPlan.shortTerms),
        ...loadFtsPdfMatches(driver, pairQuery, highlightQuery, 'pair', queryPlan.shortTerms)
      ];
    } catch {
      return [];
    }
  });
}

function loadShortTermFallbackMatches(driver: DatabaseDriver, queryPlan: FtsSearchQueryPlan) {
  if (queryPlan.ftsTerms.length >= 2 || queryPlan.shortTerms.length === 0) {
    return [];
  }
  return [
    ...loadShortTermNodeRows(driver, queryPlan.shortTerms).map((row) => buildNodeResult(row, queryPlan.shortTerms[0] ?? queryPlan.normalizedQuery, 'fallback')),
    ...loadShortTermPdfRows(driver, queryPlan.shortTerms)
      .map((row) => buildPdfResult(row, queryPlan.shortTerms[0] ?? queryPlan.normalizedQuery, 'fallback'))
      .filter((result): result is RankedWorkspaceSearchResult => result !== null)
  ];
}

function loadLiteralFtsWorkspaceMatches(driver: DatabaseDriver, queryPlan: FtsSearchQueryPlan) {
  try {
    return [
      ...loadFtsNodeMatches(driver, queryPlan.literalQuery, queryPlan.normalizedQuery, 'literal', queryPlan.shortTerms, queryPlan),
      ...loadFtsPdfMatches(driver, queryPlan.literalQuery, queryPlan.normalizedQuery, 'literal', queryPlan.shortTerms, queryPlan)
    ];
  } catch {
    return null;
  }
}

export function searchWorkspace(driver: DatabaseDriver, query: string, aliases: string[][] = []) {
  return executeFtsSearchPlan(query, {
    finalizeResults: sortAndLimitResults,
    loadAdvancedMatches: (queryPlan) => loadAdvancedFtsWorkspaceMatches(driver, queryPlan),
    loadLiteralFallbackMatches: (queryPlan) => loadFallbackNodeMatches(driver, queryPlan.normalizedQuery),
    loadLiteralMatches: (queryPlan) => loadLiteralFtsWorkspaceMatches(driver, queryPlan),
    loadPairMatches: (queryPlan) => loadPairFtsWorkspaceMatches(driver, queryPlan),
    loadPostTermFallbackMatches: (queryPlan) => [
      ...loadFallbackPdfMatches(driver, queryPlan.normalizedQuery),
      ...loadCrossPagePdfMatches(driver, queryPlan.normalizedQuery, queryPlan.shortTerms),
      ...loadAliasFallbackWorkspaceMatches(driver, queryPlan)
    ],
    loadShortQueryMatches: (queryPlan) => [
      ...loadFallbackNodeMatches(driver, queryPlan.normalizedQuery),
      ...loadFallbackPdfMatches(driver, queryPlan.normalizedQuery)
    ],
    loadShortTermFallbackMatches: (queryPlan) => loadShortTermFallbackMatches(driver, queryPlan),
    loadTermMatches: (queryPlan) => loadTermFtsWorkspaceMatches(driver, queryPlan),
    mergeResults: mergeRankedResults
  }, aliases);
}
