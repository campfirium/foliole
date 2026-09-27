export interface WorkspaceSearchResult {
  aliasMatches?: SearchAliasResultMatch[] | undefined;
  matchedOriginal?: boolean | undefined;
  excerpt: string;
  id: string;
  kind: 'external' | 'node' | 'pdf';
  externalMatch: {
    absolutePath: string;
    folderId: string;
    folderPath: string;
    importedNodeId?: string | null;
    query: string;
    relativePath: string;
    sourceKind: WorkspaceExternalSearchSourceKind;
  } | null;
  nodeMatch: {
    from: number;
    query: string;
    to: number;
  } | null;
  pdfMatch: {
    attachmentId: string;
    matchStart: number;
    page: number;
    pageTextLength: number;
    query: string;
  } | null;
  title: string;
  updatedAt: string;
}

export interface SearchAliasResultMatch {
  excerpt: string;
  externalMatch: WorkspaceSearchResult['externalMatch'];
  nodeMatch: WorkspaceSearchResult['nodeMatch'];
  pdfMatch: WorkspaceSearchResult['pdfMatch'];
  spelling: string;
}

export type WorkspaceExternalSearchSourceKind = 'external' | 'opened';

export type WorkspaceSearchPathQuality = 'fallback' | 'literal' | 'pair' | 'term';

export interface RankedWorkspaceSearchResult extends WorkspaceSearchResult {
  matchedOriginal?: boolean | undefined;
  pathQuality: WorkspaceSearchPathQuality;
  rank: number;
}

const PATH_QUALITY_RANK = {
  literal: 0,
  pair: 1,
  term: 2,
  fallback: 3
} as const;

function comparePathQuality(left: RankedWorkspaceSearchResult, right: RankedWorkspaceSearchResult) {
  const leftRank = PATH_QUALITY_RANK[left.pathQuality];
  const rightRank = PATH_QUALITY_RANK[right.pathQuality];
  return leftRank - rightRank;
}

export function mergeRankedResults(results: RankedWorkspaceSearchResult[]) {
  const merged = new Map<string, RankedWorkspaceSearchResult>();
  results.forEach((result) => {
    const key = `${result.kind}:${result.id}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, result);
      return;
    }
    const pathQualityDiff = comparePathQuality(result, existing);
    if (pathQualityDiff < 0 || (pathQualityDiff === 0 && result.rank < existing.rank)) {
      merged.set(key, {
        ...result,
        aliasMatches: mergeAliasMatches(existing.aliasMatches, result.aliasMatches),
        matchedOriginal: existing.matchedOriginal || result.matchedOriginal,
        rank: Math.min(result.rank, existing.rank)
      });
    } else {
      existing.aliasMatches = mergeAliasMatches(existing.aliasMatches, result.aliasMatches);
      existing.matchedOriginal ||= result.matchedOriginal;
    }
  });
  return [...merged.values()];
}

function mergeAliasMatches(left: SearchAliasResultMatch[] = [], right: SearchAliasResultMatch[] = []) {
  const merged = new Map(left.map((item) => [item.spelling, item]));
  for (const item of right) if (!merged.has(item.spelling)) merged.set(item.spelling, item);
  return [...merged.values()];
}

export function sortAndLimitResults(results: RankedWorkspaceSearchResult[]) {
  return results
    .sort((left, right) => {
      if (Boolean(left.matchedOriginal) !== Boolean(right.matchedOriginal)) {
        return left.matchedOriginal ? -1 : 1;
      }
      const pathQualityDiff = comparePathQuality(left, right);
      if (pathQualityDiff !== 0) {
        return pathQualityDiff;
      }
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .map((result) => ({
      aliasMatches: result.aliasMatches,
      excerpt: result.excerpt,
      externalMatch: result.externalMatch,
      id: result.id,
      kind: result.kind,
      matchedOriginal: result.matchedOriginal,
      nodeMatch: result.nodeMatch,
      pdfMatch: result.pdfMatch,
      title: result.title,
      updatedAt: result.updatedAt
    }));
}
