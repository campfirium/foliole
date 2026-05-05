import { useState } from 'react';

import { selectRuntimeImportDirectory } from '../../shared/platform/importBridge';

import { ImportSourceWorkspaceDetails } from './ImportSourceWorkspaceDetails';
import {
  applyReadwiseRootPath,
  cloneDraftImportSource,
  createDraftImportSource,
  createReadwiseImportSources,
  type DraftImportSource,
  type DraftImportSourceField,
  updateDraftImportSource
} from './importSourceWorkspaceModel';

function replaceSource(
  sources: DraftImportSource[],
  sourceId: string,
  updater: (source: DraftImportSource) => DraftImportSource
) {
  return sources.map((source) => (source.id === sourceId ? updater(source) : source));
}

async function selectFolderPath() {
  return selectRuntimeImportDirectory();
}

function useGenericImportSources() {
  const [sources, setSources] = useState<DraftImportSource[]>([createDraftImportSource(101), createDraftImportSource(102)]);
  const handleChangeSource = (sourceId: string, field: DraftImportSourceField, value: string) => {
    setSources((current) => replaceSource(current, sourceId, (source) => updateDraftImportSource(source, field, value)));
  };
  const handleCopySource = (sourceId: string) => {
    setSources((current) => {
      const source = current.find((entry) => entry.id === sourceId);
      if (!source) {
        return current;
      }
      return [...current, cloneDraftImportSource(source, current.length + 101)];
    });
  };

  const handleDeleteSource = (sourceId: string) => {
    setSources((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((source) => source.id !== sourceId);
    });
  };
  const handleChooseFolder = async (sourceId: string, field: 'primaryPath' | 'highlightPath') => {
    const selectedPath = await selectFolderPath();
    if (selectedPath) {
      handleChangeSource(sourceId, field, selectedPath);
    }
  };
  const handleChangeAction = async (sourceId: string, value: string) => {
    if (value !== 'move') {
      handleChangeSource(sourceId, 'actionMode', value);
      return;
    }
    const selectedPath = await selectFolderPath();
    if (!selectedPath) {
      return;
    }
    setSources((current) =>
      replaceSource(current, sourceId, (source) => ({ ...updateDraftImportSource(source, 'actionMode', 'move'), archivePath: selectedPath }))
    );
  };
  return { handleChangeAction, handleChangeSource, handleChooseFolder, handleCopySource, handleDeleteSource, sources };
}

function useReadwiseImportSources() {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [readwiseRootPath, setReadwiseRootPath] = useState('');
  const [readwiseSources, setReadwiseSources] = useState<DraftImportSource[]>(() => createReadwiseImportSources());
  const handleChangeSource = (sourceId: string, field: DraftImportSourceField, value: string) => {
    setReadwiseSources((current) => replaceSource(current, sourceId, (source) => updateDraftImportSource(source, field, value)));
  };
  const handleChooseRootFolder = async () => {
    const selectedPath = await selectFolderPath();
    if (!selectedPath) {
      return;
    }
    setReadwiseRootPath(selectedPath);
    setReadwiseSources((current) => applyReadwiseRootPath(current, selectedPath));
  };
  const handleChooseFolder = async (sourceId: string, field: 'primaryPath' | 'highlightPath') => {
    const selectedPath = await selectFolderPath();
    if (selectedPath) {
      handleChangeSource(sourceId, field, selectedPath);
    }
  };
  const handleChangeAction = async (sourceId: string, value: string) => {
    if (value !== 'move') {
      handleChangeSource(sourceId, 'actionMode', value);
      return;
    }
    const selectedPath = await selectFolderPath();
    if (!selectedPath) {
      return;
    }
    setReadwiseSources((current) =>
      replaceSource(current, sourceId, (source) => ({ ...updateDraftImportSource(source, 'actionMode', 'move'), archivePath: selectedPath }))
    );
  };
  return {
    detailsOpen,
    handleChangeAction,
    handleChangeSource,
    handleChooseFolder,
    handleChooseRootFolder,
    readwiseRootPath,
    readwiseSources,
    setDetailsOpen
  };
}

export function ImportSourceWorkspace({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const genericDrafts = useGenericImportSources();
  const {
    detailsOpen,
    handleChangeAction,
    handleChangeSource,
    handleChooseFolder,
    handleChooseRootFolder,
    readwiseRootPath,
    readwiseSources,
    setDetailsOpen
  } = useReadwiseImportSources();

  return (
    <ImportSourceWorkspaceDetails
      detailsOpen={detailsOpen}
      onChange={genericDrafts.handleChangeSource}
      onChangeReadwise={handleChangeSource}
      onChooseReadwiseRootFolder={() => void handleChooseRootFolder()}
      onChooseHighlightFolder={(sourceId) => void genericDrafts.handleChooseFolder(sourceId, 'highlightPath')}
      onChoosePrimaryFolder={(sourceId) => void genericDrafts.handleChooseFolder(sourceId, 'primaryPath')}
      onChooseReadwiseHighlightFolder={(sourceId) => void handleChooseFolder(sourceId, 'highlightPath')}
      onChooseReadwisePrimaryFolder={(sourceId) => void handleChooseFolder(sourceId, 'primaryPath')}
      onChangeAction={(sourceId, value) => void genericDrafts.handleChangeAction(sourceId, value)}
      onChangeReadwiseAction={(sourceId, value) => void handleChangeAction(sourceId, value)}
      onCopySource={genericDrafts.handleCopySource}
      onDeleteSource={genericDrafts.handleDeleteSource}
      onOpenChange={onOpenChange}
      onRunNow={() => undefined}
      onToggleDetails={() => setDetailsOpen((current) => !current)}
      open={open}
      readwiseRootPath={readwiseRootPath}
      readwiseSources={readwiseSources}
      sources={genericDrafts.sources}
    />
  );
}
