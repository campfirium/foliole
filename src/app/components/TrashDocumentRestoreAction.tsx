import { useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { importExternalDocument } from '../../shared/platform/externalDocumentImportRepository';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../shared/ui';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';

import { resolveImportableSourcePath } from './documentPanelSourceHelpers';
import { useNodeSourceDetails } from './useNodeSourceDetails';

export function TrashDocumentHeaderImportAction({
  activeNodeId,
  isTrashViewOpen,
  onSelectNode,
  trashedNodeIds
}: {
  activeNodeId: string | null;
  isTrashViewOpen?: boolean;
  onSelectNode: (nodeId: string) => void;
  trashedNodeIds: string[];
}) {
  const t = useTranslation();
  const [isImporting, setIsImporting] = useState(false);
  const trashNodeId = isTrashViewOpen &&
    activeNodeId &&
    trashedNodeIds.includes(activeNodeId)
    ? activeNodeId
    : null;
  const sourceDetails = useNodeSourceDetails(trashNodeId);
  const importSourcePath = resolveImportableSourcePath(sourceDetails);

  async function handleImport() {
    if (!importSourcePath) return;
    setIsImporting(true);
    try {
      const result = await importExternalDocument(importSourcePath);
      if (!result?.node_id) return;
      await refreshWorkspaceState('external-document-import');
      onSelectNode(result.node_id);
    } finally {
      setIsImporting(false);
    }
  }

  return importSourcePath
    ? (
        <AppTooltip>
          <AppTooltipTrigger asChild>
            <button
              aria-label={t('desktop.externalLibrary.preview.importToFoliole')}
              className="inline-block border-0 bg-transparent p-0 text-sm font-normal leading-[1.25] text-foreground/45 transition-colors hover:text-foreground/65 focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"
              disabled={isImporting}
              onClick={() => void handleImport()}
              type="button"
            >
              {t('desktop.externalLibrary.preview.import')}
            </button>
          </AppTooltipTrigger>
          <AppTooltipContent side="bottom">{t('desktop.externalLibrary.preview.importToFoliole')}</AppTooltipContent>
        </AppTooltip>
      )
    : null;
}
