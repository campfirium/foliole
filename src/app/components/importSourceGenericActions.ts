import type { ImportManagerSettings } from '../../../lib/core/import/importManagerSettings';

import {
  cloneDraftImportSource,
  materializeWatchedSourceId,
  type DraftImportSource,
  type DraftImportSourceField,
  updateDraftImportSource
} from './importSourceWorkspaceModel';

type SetSettings = (updater: (current: ImportManagerSettings) => ImportManagerSettings) => void;

function replaceSource(
  sources: DraftImportSource[],
  sourceId: string,
  updater: (source: DraftImportSource) => DraftImportSource
) {
  return sources.map((source) => (source.id === sourceId ? updater(source) : source));
}

export function createGenericSourceActions(
  setSettings: SetSettings,
  selectFolderPath: () => Promise<string | null>
) {
  const handleChangeSource = (sourceId: string, field: DraftImportSourceField, value: string) => {
    setSettings((current) => ({
      ...current,
      sources: replaceSource(current.sources, sourceId, (source) =>
        updateDraftImportSource(
          field === 'primaryPath' || field === 'highlightPath' ? materializeWatchedSourceId(source) : source,
          field,
          value
        )
      )
    }));
  };
  return {
    handleChangeAction(sourceId: string, value: string) {
      handleChangeSource(sourceId, 'actionMode', value);
    },
    handleChangeSource,
    async handleChooseFolder(sourceId: string, field: 'primaryPath' | 'highlightPath') {
      const selectedPath = await selectFolderPath();
      if (selectedPath) {
        handleChangeSource(sourceId, field, selectedPath);
      }
    },
    handleCopySource(sourceId: string) {
      setSettings((current) => {
        const source = current.sources.find((entry) => entry.id === sourceId);
        if (!source) {
          return current;
        }
        return {
          ...current,
          sources: [
            ...current.sources,
            cloneDraftImportSource(source)
          ]
        };
      });
    },
    handleDeleteSource(sourceId: string) {
      setSettings((current) =>
        current.sources.length <= 1
          ? current
          : { ...current, sources: current.sources.filter((source) => source.id !== sourceId) }
      );
    }
  };
}

export { replaceSource };
