import { useState } from 'react';

import { selectRuntimeImportDirectory } from '../../shared/platform/importBridge';

import { ImportSourceWorkspaceDetails } from './ImportSourceWorkspaceDetails';
import {
  cloneDraftImportSource,
  createDraftImportSource,
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

function useImportSourceDrafts() {
  const [sources, setSources] = useState<DraftImportSource[]>([createDraftImportSource(1), createDraftImportSource(2)]);

  const handleChangeSource = (sourceId: string, field: DraftImportSourceField, value: string) => {
    setSources((current) => replaceSource(current, sourceId, (source) => updateDraftImportSource(source, field, value)));
  };

  const handleChooseFolder = async (sourceId: string, field: 'primaryPath' | 'highlightPath') => {
    const selectedPath = await selectFolderPath();
    if (!selectedPath) {
      return;
    }
    handleChangeSource(sourceId, field, selectedPath);
  };

  const handleChooseMoveFolder = async (sourceId: string) => {
    const selectedPath = await selectFolderPath();
    if (!selectedPath) {
      return;
    }

    setSources((current) =>
      replaceSource(current, sourceId, (source) => ({
        ...updateDraftImportSource(source, 'actionMode', 'move'),
        archivePath: selectedPath
      }))
    );
  };

  const handleChangeAction = async (sourceId: string, value: string) => {
    if (value === 'move') {
      await handleChooseMoveFolder(sourceId);
      return;
    }
    handleChangeSource(sourceId, 'actionMode', value);
  };

  const handleCopySource = (sourceId: string) => {
    setSources((current) => {
      const source = current.find((entry) => entry.id === sourceId);
      if (!source) {
        return current;
      }
      return [...current, cloneDraftImportSource(source, current.length + 1)];
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

  const handleRunNow = () => undefined;

  return {
    handleChangeAction,
    handleChangeSource,
    handleChooseFolder,
    handleChooseMoveFolder,
    handleCopySource,
    handleDeleteSource,
    handleRunNow,
    sources
  };
}

export function ImportSourceWorkspace({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    handleChangeAction,
    handleChangeSource,
    handleChooseFolder,
    handleCopySource,
    handleDeleteSource,
    handleRunNow,
    sources
  } = useImportSourceDrafts();

  return (
    <ImportSourceWorkspaceDetails
      onChange={handleChangeSource}
      onChooseHighlightFolder={(sourceId) => void handleChooseFolder(sourceId, 'highlightPath')}
      onChoosePrimaryFolder={(sourceId) => void handleChooseFolder(sourceId, 'primaryPath')}
      onChangeAction={(sourceId, value) => void handleChangeAction(sourceId, value)}
      onCopySource={handleCopySource}
      onDeleteSource={handleDeleteSource}
      onOpenChange={onOpenChange}
      onRunNow={handleRunNow}
      open={open}
      sources={sources}
    />
  );
}
