import type { DatabaseDriver } from './driver.js';
import { buildFtsSearchQueryPlan, type FtsSearchQueryPlan } from './ftsSearchQuery.js';
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

const PAIR_RESULTS_LIMIT = 10;
const MERGED_CANDIDATE_LIMIT = 120;

export type { WorkspaceSearchResult } from './workspaceSearchResults.js';

function loadFallbackNodeMatches(driver: DatabaseDriver, query: string) {
  const titleMatches = driver.queryAll<WorkspaceSearchRow>(TITLE_FALLBACK_SQL, [query, MAX_RESULTS]).map((row) => ({
    ...buildNodeResult({ ...row, rank: 10 }, query, 'fallback'),
    rank: 10
  }));
  const remaining = MAX_RESULTS - titleMatches.length;
  const contentMatches =
    remaining <= 0
      ? []
      : driver.queryAll<WorkspaceSearchRow>(CONTENT_FALLBACK_SQL, [query, query, remaining]).map((row) => ({
          ...buildNodeResult({ ...row, rank: 100 }, query, 'fallback'),
          rank: 100
        }));
  return [...titleMatches, ...contentMatches];
}

function loadFallbackPdfMatches(driver: DatabaseDriver, query: string) {
  return driver.queryAll<WorkspacePdfSearchRow>(PDF_FALLBACK_SQL, [query, MAX_RESULTS]).map((row) => ({
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
  limit = MAX_RESULTS
) {
  return driver
    .queryAll<WorkspaceSearchRow>(NODE_FTS_SQL, [ftsQuery, limit])
    .filter((row) => shortTerms.length === 0 || nodeRowMatchesShortTerms(row, shortTerms))
    .map((row) => buildNodeResult(row, highlightQuery, pathQuality));
}

function loadFtsPdfMatches(
  driver: DatabaseDriver,
  ftsQuery: string,
  highlightQuery: string,
  pathQuality: WorkspaceSearchPathQuality,
  shortTerms: string[] = [],
  limit = MAX_RESULTS
) {
  return driver
    .queryAll<WorkspacePdfSearchRow>(PDF_FTS_SQL, [ftsQuery, limit])
    .filter((row) => shortTerms.length === 0 || pdfRowMatchesShortTerms(row, shortTerms))
    .map((row) => buildPdfResult(row, highlightQuery, pathQuality))
    .filter((result): result is RankedWorkspaceSearchResult => result !== null);
}

function loadCrossPagePdfMatches(driver: DatabaseDriver, query: string, shortTerms: string[] = []) {
  if (query.length <= 1) {
    return [];
  }
  const tailLength = query.length - 1;
  return driver
    .queryAll<WorkspacePdfCrossPageSearchRow>(PDF_CROSS_PAGE_MATCH_SQL, [tailLength, tailLength, tailLength, tailLength, tailLength, query, query, MAX_RESULTS])
    .filter((row) => shortTerms.length === 0 || crossPagePdfRowMatchesShortTerms(row, shortTerms))
    .map((row) => buildCrossPagePdfResult(row, query));
}

function loadAdvancedFtsWorkspaceMatches(driver: DatabaseDriver, queryPlan: FtsSearchQueryPlan) {
  if (!queryPlan.advancedQuery) {
    return [];
  }
  try {
    return [
      ...loadFtsNodeMatches(driver, queryPlan.advancedQuery, queryPlan.highlightQuery, 'term'),
      ...loadFtsPdfMatches(driver, queryPlan.advancedQuery, queryPlan.highlightQuery, 'term')
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
        ...loadFtsNodeMatches(driver, pairQuery, highlightQuery, 'pair', queryPlan.shortTerms, PAIR_RESULTS_LIMIT),
        ...loadFtsPdfMatches(driver, pairQuery, highlightQuery, 'pair', queryPlan.shortTerms, PAIR_RESULTS_LIMIT)
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
    ...loadShortTermNodeRows(driver, queryPlan.shortTerms, MAX_RESULTS).map((row) => buildNodeResult(row, queryPlan.shortTerms[0] ?? queryPlan.normalizedQuery, 'fallback')),
    ...loadShortTermPdfRows(driver, queryPlan.shortTerms, MAX_RESULTS)
      .map((row) => buildPdfResult(row, queryPlan.shortTerms[0] ?? queryPlan.normalizedQuery, 'fallback'))
      .filter((result): result is RankedWorkspaceSearchResult => result !== null)
  ];
}

export function searchWorkspace(driver: DatabaseDriver, query: string) {
  const queryPlan = buildFtsSearchQueryPlan(query);
  const normalizedQuery = queryPlan.normalizedQuery;
  if (!normalizedQuery) {
    return [];
  }
  const results =
    normalizedQuery.length <= 2
      ? [...loadFallbackNodeMatches(driver, normalizedQuery), ...loadFallbackPdfMatches(driver, normalizedQuery)]
      : mergeRankedResults([
          ...loadFtsNodeMatches(driver, queryPlan.literalQuery, queryPlan.normalizedQuery, 'literal', queryPlan.shortTerms),
          ...loadFtsPdfMatches(driver, queryPlan.literalQuery, queryPlan.normalizedQuery, 'literal', queryPlan.shortTerms),
          ...loadPairFtsWorkspaceMatches(driver, queryPlan),
          ...loadTermFtsWorkspaceMatches(driver, queryPlan),
          ...loadFallbackPdfMatches(driver, queryPlan.normalizedQuery),
          ...loadCrossPagePdfMatches(driver, queryPlan.normalizedQuery, queryPlan.shortTerms),
          ...loadShortTermFallbackMatches(driver, queryPlan),
          ...loadAdvancedFtsWorkspaceMatches(driver, queryPlan)
        ]).slice(0, MERGED_CANDIDATE_LIMIT);
  return sortAndLimitResults(results, MAX_RESULTS);
}
