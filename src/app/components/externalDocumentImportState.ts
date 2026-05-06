import { useState } from 'react';

import {
  importExternalDocument,
  type ExternalDocumentImportResult
} from '../../shared/platform/externalDocumentImportRepository';
import type { ExternalDocumentPreview } from '../../shared/platform/externalDocumentPreviewRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function useOpenImportedExternalDocument(
  preview: ExternalDocumentPreview | null,
  onOpenImportedNode: (result: ExternalDocumentImportResult) => void
) {
  const [isImporting, setIsImporting] = useState(false);

  async function handleImport() {
    if (!preview) return;
    setIsImporting(true);
    try {
      const result = await importExternalDocument(preview.absolutePath);
      if (!result?.node_id) return;
      await useWorkspaceStore.persist.rehydrate();
      onOpenImportedNode(result);
    } finally {
      setIsImporting(false);
    }
  }

  return { handleImport, isImporting };
}
