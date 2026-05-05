import { useState } from 'react';

import { ImportSourceWorkspaceDetails } from './ImportSourceWorkspaceDetails';
import { inspectReadwiseReaderSetup } from './readwiseReaderConfigBridge';
import { ReadwiseReaderConfigDialog } from './ReadwiseReaderConfigDialog';
import { useImportSourceWorkspaceState } from './useImportSourceWorkspaceState';

function ReadwiseReaderConfigDialogHost(props: {
  configDialogOpen: boolean;
  onOpenChange: (open: boolean) => void;
  readwiseReaderConfig: ReturnType<typeof useImportSourceWorkspaceState>['readwiseReaderConfig'];
  readwiseRootPath: string;
  onSave: ReturnType<typeof useImportSourceWorkspaceState>['handleSaveReadwiseReaderConfig'];
}) {
  return (
    <ReadwiseReaderConfigDialog
      config={props.readwiseReaderConfig}
      onDetect={(config) => inspectReadwiseReaderSetup({ config, readwiseRootPath: props.readwiseRootPath })}
      onOpenChange={props.onOpenChange}
      onSave={props.onSave}
      open={props.configDialogOpen}
      readwiseRootPath={props.readwiseRootPath}
    />
  );
}

export function ImportSourceWorkspace({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    detailsOpen,
    handleChangeAction,
    handleChangeReadwiseAction,
    handleChangeReadwiseSource,
    handleSaveReadwiseReaderConfig,
    handleChangeSource,
    handleChooseFolder,
    handleChooseReadwiseFolder,
    handleChooseReadwiseRootFolder,
    handleCopySource,
    handleDeleteSource,
    readwiseReaderConfig,
    readwiseRootPath,
    readwiseSources,
    setDetailsOpen,
    sources
  } = useImportSourceWorkspaceState();
  const [readwiseConfigDialogOpen, setReadwiseConfigDialogOpen] = useState(false);

  return (
    <>
      <ImportSourceWorkspaceDetails
        detailsOpen={detailsOpen}
        onChange={handleChangeSource}
        onChangeAction={(sourceId, value) => void handleChangeAction(sourceId, value)}
        onChangeReadwise={handleChangeReadwiseSource}
        onChangeReadwiseAction={(sourceId, value) => void handleChangeReadwiseAction(sourceId, value)}
        onChooseHighlightFolder={(sourceId) => void handleChooseFolder(sourceId, 'highlightPath')}
        onChoosePrimaryFolder={(sourceId) => void handleChooseFolder(sourceId, 'primaryPath')}
        onChooseReadwiseHighlightFolder={(sourceId) => void handleChooseReadwiseFolder(sourceId, 'highlightPath')}
        onChooseReadwisePrimaryFolder={(sourceId) => void handleChooseReadwiseFolder(sourceId, 'primaryPath')}
        onChooseReadwiseRootFolder={() => void handleChooseReadwiseRootFolder()}
        onCopySource={handleCopySource}
        onDeleteSource={handleDeleteSource}
        onOpenChange={onOpenChange}
        onOpenReadwiseConfig={() => setReadwiseConfigDialogOpen(true)}
        onRunNow={() => undefined}
        onToggleDetails={() => setDetailsOpen((current) => !current)}
        open={open}
        readwiseReaderConfig={readwiseReaderConfig}
        readwiseRootPath={readwiseRootPath}
        readwiseSources={readwiseSources}
        sources={sources}
      />
      <ReadwiseReaderConfigDialogHost
        configDialogOpen={readwiseConfigDialogOpen}
        onOpenChange={setReadwiseConfigDialogOpen}
        onSave={handleSaveReadwiseReaderConfig}
        readwiseReaderConfig={readwiseReaderConfig}
        readwiseRootPath={readwiseRootPath}
      />
    </>
  );
}
