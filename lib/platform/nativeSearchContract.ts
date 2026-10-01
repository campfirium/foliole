import type { WorkspaceRemovedSearchEntry } from '../core/database/workspaceRemovedSearchEntry.js';
import type { WorkspaceExternalSearchSourceKind } from '../core/database/workspaceSearchResults.js';

export interface NativeWorkspaceSearchResult {
  aliasMatches?: Array<{
    excerpt: string;
    externalMatch: NativeWorkspaceSearchResult['externalMatch'];
    nodeMatch: NativeWorkspaceSearchResult['nodeMatch'];
    pdfMatch: NativeWorkspaceSearchResult['pdfMatch'];
    spelling: string;
  }>;
  excerpt: string;
  id: string;
  kind: 'external' | 'node' | 'pdf' | 'removed';
  removedMatch?: { entry: WorkspaceRemovedSearchEntry; query: string };
  isTrashed?: boolean | undefined;
  matchedOriginal?: boolean;
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
