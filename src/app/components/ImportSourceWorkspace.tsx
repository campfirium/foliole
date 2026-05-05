import { useState } from 'react';

import { ImportSourceWorkspaceDetails } from './ImportSourceWorkspaceDetails';
import {
  ReadwiseReaderConfigDialogHost,
  type KeepDisableDialogState,
  type KeepPreviewDialogState,
  useKeepPreviewDialog
} from './importSourceWorkspaceDialogs';
import { KeepImportDisableDialog } from './KeepImportDisableDialog';
import { KeepImportPreviewDialog } from './KeepImportPreviewDialog';
import { useImportSourceWorkspaceState } from './useImportSourceWorkspaceState';

type ImportSourceWorkspaceProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ImportSourceWorkspaceContentProps = {
  detailsOpen: boolean;
  keepPreviewDialog: KeepPreviewDialogState | null;
  keepDisableDialog: KeepDisableDialogState | null;
  onChange: ReturnType<typeof useImportSourceWorkspaceState>['handleChangeSource'];
  onChangeReadwise: ReturnType<typeof useImportSourceWorkspaceState>['handleChangeReadwiseSource'];
  onChooseFolder: ReturnType<typeof useImportSourceWorkspaceState>['handleChooseFolder'];
  onChooseReadwiseFolder: ReturnType<typeof useImportSourceWorkspaceState>['handleChooseReadwiseFolder'];
  onChooseReadwiseRootFolder: ReturnType<typeof useImportSourceWorkspaceState>['handleChooseReadwiseRootFolder'];
  onConfirmKeepDisable: () => void;
  onConfirmKeepPreview: () => void;
  onCopySource: ReturnType<typeof useImportSourceWorkspaceState>['handleCopySource'];
  onDeleteSource: ReturnType<typeof useImportSourceWorkspaceState>['handleDeleteSource'];
  onDisableKeepImport: (sourceId: string, scope: 'readwiseSources' | 'sources') => void;
  onKeepDisableOpenChange: (open: boolean) => void;
  onKeepPreviewOpenChange: (open: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onOpenKeepPreview: (sourceId: string, scope: 'readwiseSources' | 'sources') => Promise<void>;
  onOpenReadwiseConfig: () => void;
  onSaveReadwiseReaderConfig: ReturnType<typeof useImportSourceWorkspaceState>['handleSaveReadwiseReaderConfig'];
  disableSourceLabel: string;
  onToggleDetails: () => void;
  open: boolean;
  previewSourceLabel: string;
  readwiseConfigDialogOpen: boolean;
  readwiseReaderConfig: ReturnType<typeof useImportSourceWorkspaceState>['readwiseReaderConfig'];
  readwiseRootPath: string;
  readwiseSources: ReturnType<typeof useImportSourceWorkspaceState>['readwiseSources'];
  setReadwiseConfigDialogOpen: (open: boolean) => void;
  sources: ReturnType<typeof useImportSourceWorkspaceState>['sources'];
};

function ImportSourceWorkspacePanel(props: ImportSourceWorkspaceContentProps) {
  return (
    <ImportSourceWorkspaceDetails
      detailsOpen={props.detailsOpen}
      onChange={props.onChange}
      onChangeReadwise={props.onChangeReadwise}
      onChooseHighlightFolder={(sourceId) => void props.onChooseFolder(sourceId, 'highlightPath')}
      onChoosePrimaryFolder={(sourceId) => void props.onChooseFolder(sourceId, 'primaryPath')}
      onChooseReadwiseHighlightFolder={(sourceId) => void props.onChooseReadwiseFolder(sourceId, 'highlightPath')}
      onChooseReadwisePrimaryFolder={(sourceId) => void props.onChooseReadwiseFolder(sourceId, 'primaryPath')}
      onChooseReadwiseRootFolder={() => void props.onChooseReadwiseRootFolder()}
      onDisableKeepImport={props.onDisableKeepImport}
      onCopySource={props.onCopySource}
      onDeleteSource={props.onDeleteSource}
      onOpenChange={props.onOpenChange}
      onOpenReadwiseConfig={props.onOpenReadwiseConfig}
      onPreviewKeepImport={props.onOpenKeepPreview}
      onToggleDetails={props.onToggleDetails}
      open={props.open}
      readwiseReaderConfig={props.readwiseReaderConfig}
      readwiseRootPath={props.readwiseRootPath}
      readwiseSources={props.readwiseSources}
      sources={props.sources}
    />
  );
}

function ImportSourceWorkspaceDialogs(props: ImportSourceWorkspaceContentProps) {
  return (
    <>
      <ReadwiseReaderConfigDialogHost
        configDialogOpen={props.readwiseConfigDialogOpen}
        onOpenChange={props.setReadwiseConfigDialogOpen}
        onSave={props.onSaveReadwiseReaderConfig}
        readwiseReaderConfig={props.readwiseReaderConfig}
        readwiseRootPath={props.readwiseRootPath}
      />
      <KeepImportPreviewDialog
        onConfirm={props.onConfirmKeepPreview}
        onOpenChange={props.onKeepPreviewOpenChange}
        open={Boolean(props.keepPreviewDialog?.open)}
        preview={props.keepPreviewDialog?.preview ?? null}
        sourceLabel={props.previewSourceLabel}
      />
      <KeepImportDisableDialog
        onConfirm={props.onConfirmKeepDisable}
        onOpenChange={props.onKeepDisableOpenChange}
        open={Boolean(props.keepDisableDialog?.open)}
        sourceLabel={props.disableSourceLabel}
      />
    </>
  );
}

function ImportSourceWorkspaceContent(props: ImportSourceWorkspaceContentProps) {
  return (
    <>
      <ImportSourceWorkspacePanel {...props} />
      <ImportSourceWorkspaceDialogs {...props} />
    </>
  );
}

function createImportSourceWorkspaceViewModel(
  base: ReturnType<typeof useImportSourceWorkspaceState>,
  dialogState: ReturnType<typeof useKeepPreviewDialog>,
  onOpenChange: (open: boolean) => void,
  readwiseConfigDialogOpen: boolean,
  setReadwiseConfigDialogOpen: (open: boolean) => void
) {
  return {
    detailsOpen: base.detailsOpen,
    disableSourceLabel: dialogState.disableSource?.primaryPath || 'Selected keep source',
    keepDisableDialog: dialogState.keepDisableDialog,
    keepPreviewDialog: dialogState.keepPreviewDialog,
    onChange: base.handleChangeSource,
    onChangeReadwise: base.handleChangeReadwiseSource,
    onChooseFolder: base.handleChooseFolder,
    onChooseReadwiseFolder: base.handleChooseReadwiseFolder,
    onChooseReadwiseRootFolder: base.handleChooseReadwiseRootFolder,
    onConfirmKeepDisable: dialogState.handleConfirmKeepDisable,
    onConfirmKeepPreview: dialogState.handleConfirmKeepPreview,
    onCopySource: base.handleCopySource,
    onDeleteSource: base.handleDeleteSource,
    onDisableKeepImport: dialogState.handleRequestKeepDisable,
    onKeepDisableOpenChange: dialogState.handleKeepDisableOpenChange,
    onKeepPreviewOpenChange: dialogState.handleKeepPreviewOpenChange,
    onOpenChange,
    onOpenKeepPreview: dialogState.handleOpenKeepPreview,
    onOpenReadwiseConfig: () => setReadwiseConfigDialogOpen(true),
    onSaveReadwiseReaderConfig: base.handleSaveReadwiseReaderConfig,
    onToggleDetails: () => base.setDetailsOpen((current) => !current),
    previewSourceLabel: dialogState.previewSource?.primaryPath || 'Selected keep source',
    readwiseConfigDialogOpen,
    readwiseReaderConfig: base.readwiseReaderConfig,
    readwiseRootPath: base.readwiseRootPath,
    readwiseSources: base.readwiseSources,
    setReadwiseConfigDialogOpen,
    sources: base.sources
  };
}

function useImportSourceWorkspaceViewModel(onOpenChange: (open: boolean) => void) {
  const base = useImportSourceWorkspaceState();
  const [readwiseConfigDialogOpen, setReadwiseConfigDialogOpen] = useState(false);
  const dialogState = useKeepPreviewDialog({
    handleConfirmKeepImport: base.handleConfirmKeepImport,
    handleDisableKeepImport: base.handleDisableKeepImport,
    handlePreviewKeepImport: base.handlePreviewKeepImport,
    readwiseSources: base.readwiseSources,
    sources: base.sources
  });
  return createImportSourceWorkspaceViewModel(base, dialogState, onOpenChange, readwiseConfigDialogOpen, setReadwiseConfigDialogOpen);
}

export function ImportSourceWorkspace({ open, onOpenChange }: ImportSourceWorkspaceProps) {
  const viewModel = useImportSourceWorkspaceViewModel(onOpenChange);
  return <ImportSourceWorkspaceContent {...viewModel} open={open} />;
}
