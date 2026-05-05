import type { NativeTextImportResult } from '../../../lib/platform/nativeImportContract';
import { useWorkspaceStore } from '../../store/workspaceStore';

import type { WorkspaceSearchResult } from './workspaceSearch';

export async function openImportedExternalResult(
  result: NativeTextImportResult,
  onOpenResult: (result: WorkspaceSearchResult) => void,
  setExternalPreviewPath: (value: string | null) => void
) {
  setExternalPreviewPath(null);
  if (!result.node_id) return;
  await useWorkspaceStore.persist.rehydrate();
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
