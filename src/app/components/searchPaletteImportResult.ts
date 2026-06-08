import type { ExternalDocumentImportResult } from '../../shared/platform/externalDocumentImportRepository';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';

import type { WorkspaceSearchResult } from './workspaceSearch';

export async function openImportedExternalResult(
  result: ExternalDocumentImportResult,
  onOpenResult: (result: WorkspaceSearchResult, options?: { preview?: boolean }) => void,
  setExternalPreviewPath: (value: string | null) => void
) {
  setExternalPreviewPath(null);
  if (!result.node_id) return;
  await refreshWorkspaceState('search-palette-import');
  onOpenResult({
    excerpt: '',
    externalMatch: null,
    id: result.node_id,
    kind: 'node',
    nodeMatch: null,
    pdfMatch: null,
    title: result.source_name,
    updatedAt: result.imported_at
  });
}
