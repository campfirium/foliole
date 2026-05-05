import { ImportSourceWorkspaceDetails } from './ImportSourceWorkspaceDetails';
import { useImportSourceWorkspaceState } from './useImportSourceWorkspaceState';

export function ImportSourceWorkspace({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    detailsOpen,
    handleChangeAction,
    handleChangeReadwiseAction,
    handleChangeReadwiseSource,
    handleChangeSource,
    handleChooseFolder,
    handleChooseReadwiseFolder,
    handleChooseReadwiseRootFolder,
    handleCopySource,
    handleDeleteSource,
    readwiseRootPath,
    readwiseSources,
    setDetailsOpen,
    sources
  } = useImportSourceWorkspaceState();

  return (
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
      onRunNow={() => undefined}
      onToggleDetails={() => setDetailsOpen((current) => !current)}
      open={open}
      readwiseRootPath={readwiseRootPath}
      readwiseSources={readwiseSources}
      sources={sources}
    />
  );
}
