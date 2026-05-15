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

export interface RankedWorkspaceSearchResult extends WorkspaceSearchResult {
  rank: number;
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
    if (result.rank < existing.rank) {
      merged.set(key, { ...existing, rank: result.rank });
    }
  });
  return [...merged.values()];
}

export function sortAndLimitResults(results: RankedWorkspaceSearchResult[], maxResults: number) {
  return results
    .sort((left, right) => {
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
