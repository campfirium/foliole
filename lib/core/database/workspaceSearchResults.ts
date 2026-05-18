export interface WorkspaceSearchResult {
  excerpt: string;
  id: string;
  kind: 'external' | 'node' | 'pdf';
  externalMatch: {
    absolutePath: string;
    folderId: string;
    folderPath: string;
    query: string;
    relativePath: string;
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

export type WorkspaceSearchPathQuality = 'fallback' | 'literal' | 'pair' | 'term';

export interface RankedWorkspaceSearchResult extends WorkspaceSearchResult {
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
      merged.set(key, { ...result, rank: Math.min(result.rank, existing.rank) });
    }
  });
  return [...merged.values()];
}

export function sortAndLimitResults(results: RankedWorkspaceSearchResult[], maxResults: number) {
  return results
    .sort((left, right) => {
      const pathQualityDiff = comparePathQuality(left, right);
      if (pathQualityDiff !== 0) {
        return pathQualityDiff;
      }
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, maxResults)
    .map((result) => ({
      excerpt: result.excerpt,
      externalMatch: result.externalMatch,
      id: result.id,
      kind: result.kind,
      nodeMatch: result.nodeMatch,
      pdfMatch: result.pdfMatch,
      title: result.title,
      updatedAt: result.updatedAt
    }));
}
