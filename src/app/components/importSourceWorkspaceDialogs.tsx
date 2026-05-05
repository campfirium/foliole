import { useState } from 'react';

import type { KeepImportPreviewSummary } from '../../../lib/core/import/importManagerSettings';

import { inspectReadwiseReaderSetup } from './readwiseReaderSetupInspection';
import { ReadwiseReaderConfigDialog } from './ReadwiseReaderConfigDialog';
import { useImportSourceWorkspaceState } from './useImportSourceWorkspaceState';

export type KeepPreviewDialogState = {
  open: boolean;
  preview: KeepImportPreviewSummary | null;
  scope: 'readwiseSources' | 'sources';
  sourceId: string;
};

export type KeepDisableDialogState = {
  open: boolean;
  scope: 'readwiseSources' | 'sources';
  sourceId: string;
};

export function ReadwiseReaderConfigDialogHost(props: {
  configDialogOpen: boolean;
  onOpenChange: (open: boolean) => void;
  readwiseReaderConfig: ReturnType<typeof useImportSourceWorkspaceState>['readwiseReaderConfig'];
  readwiseRootPath: string;
  readwiseSources: ReturnType<typeof useImportSourceWorkspaceState>['readwiseSources'];
  onSave: ReturnType<typeof useImportSourceWorkspaceState>['handleSaveReadwiseReaderSetup'];
}) {
  return (
    <ReadwiseReaderConfigDialog
      config={props.readwiseReaderConfig}
      onPreview={(input) =>
        inspectReadwiseReaderSetup({
          articleDirectoryPath: input.articleDirectoryPath,
          config: input.config,
          fullDocumentDirectoryPath: input.fullDocumentDirectoryPath
        })
      }
      onOpenChange={props.onOpenChange}
      onSave={props.onSave}
      open={props.configDialogOpen}
      readwiseRootPath={props.readwiseRootPath}
      readwiseSources={props.readwiseSources}
    />
  );
}

export function useKeepPreviewDialog(props: {
  handleConfirmKeepImport: ReturnType<typeof useImportSourceWorkspaceState>['handleConfirmKeepImport'];
  handleDisableKeepImport: ReturnType<typeof useImportSourceWorkspaceState>['handleDisableKeepImport'];
  handlePreviewKeepImport: ReturnType<typeof useImportSourceWorkspaceState>['handlePreviewKeepImport'];
  readwiseSources: ReturnType<typeof useImportSourceWorkspaceState>['readwiseSources'];
  sources: ReturnType<typeof useImportSourceWorkspaceState>['sources'];
}) {
  const [keepPreviewDialog, setKeepPreviewDialog] = useState<KeepPreviewDialogState | null>(null);
  const [keepDisableDialog, setKeepDisableDialog] = useState<KeepDisableDialogState | null>(null);
  const allSources = [...props.readwiseSources, ...props.sources];
  const previewSource = keepPreviewDialog
    ? allSources.find((source) => source.id === keepPreviewDialog.sourceId) ?? null
    : null;
  const disableSource = keepDisableDialog
    ? allSources.find((source) => source.id === keepDisableDialog.sourceId) ?? null
    : null;

  return {
    disableSource,
    keepDisableDialog,
    keepPreviewDialog,
    previewSource,
    handleKeepDisableOpenChange(nextOpen: boolean) {
      if (!nextOpen) {
        setKeepDisableDialog(null);
      }
    },
    async handleOpenKeepPreview(sourceId: string, scope: 'readwiseSources' | 'sources') {
      const preview = await props.handlePreviewKeepImport(sourceId, scope);
      if (!preview) {
        return;
      }
      setKeepPreviewDialog({ open: true, preview, scope, sourceId });
    },
    handleRequestKeepDisable(sourceId: string, scope: 'readwiseSources' | 'sources') {
      setKeepDisableDialog({ open: true, scope, sourceId });
    },
    handleKeepPreviewOpenChange(nextOpen: boolean) {
      if (!nextOpen) {
        setKeepPreviewDialog(null);
      }
    },
    handleConfirmKeepPreview() {
      if (!keepPreviewDialog) {
        return;
      }
      props.handleConfirmKeepImport(keepPreviewDialog.sourceId, keepPreviewDialog.scope);
      setKeepPreviewDialog(null);
    },
    handleConfirmKeepDisable() {
      if (!keepDisableDialog) {
        return;
      }
      props.handleDisableKeepImport(keepDisableDialog.sourceId, keepDisableDialog.scope);
      setKeepDisableDialog(null);
    }
  };
}
