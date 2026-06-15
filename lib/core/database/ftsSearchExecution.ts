import { buildFtsSearchQueryPlan, type FtsSearchQueryPlan } from './ftsSearchQuery.js';

export interface FtsSearchExecutionAdapter<Candidate, Result = Candidate> {
  finalizeResults: (results: Candidate[]) => Result[];
  loadAdvancedMatches: (queryPlan: FtsSearchQueryPlan) => Candidate[];
  loadLiteralFallbackMatches?: (queryPlan: FtsSearchQueryPlan) => Candidate[];
  loadLiteralMatches: (queryPlan: FtsSearchQueryPlan) => Candidate[] | null;
  loadPairMatches: (queryPlan: FtsSearchQueryPlan) => Candidate[];
  loadPostTermFallbackMatches?: (queryPlan: FtsSearchQueryPlan) => Candidate[];
  loadShortQueryMatches: (queryPlan: FtsSearchQueryPlan) => Candidate[];
  loadShortTermFallbackMatches: (queryPlan: FtsSearchQueryPlan) => Candidate[];
  loadTermMatches: (queryPlan: FtsSearchQueryPlan) => Candidate[];
  mergeResults: (results: Candidate[]) => Candidate[];
}

export function executeFtsSearchPlan<Candidate, Result = Candidate>(
  query: string,
  adapter: FtsSearchExecutionAdapter<Candidate, Result>
) {
  const queryPlan = buildFtsSearchQueryPlan(query);
  if (!queryPlan.normalizedQuery) {
    return [];
  }
  if (queryPlan.normalizedQuery.length <= 2) {
    return adapter.finalizeResults(adapter.loadShortQueryMatches(queryPlan));
  }
  const literalMatches = adapter.loadLiteralMatches(queryPlan);
  const literalResults = literalMatches ?? adapter.loadLiteralFallbackMatches?.(queryPlan) ?? [];
  const mergedResults = adapter.mergeResults([
    ...literalResults,
    ...adapter.loadPairMatches(queryPlan),
    ...adapter.loadTermMatches(queryPlan),
    ...(adapter.loadPostTermFallbackMatches?.(queryPlan) ?? []),
    ...adapter.loadShortTermFallbackMatches(queryPlan),
    ...adapter.loadAdvancedMatches(queryPlan)
  ]);
  return adapter.finalizeResults(mergedResults);
}
