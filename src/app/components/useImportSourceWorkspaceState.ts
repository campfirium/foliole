import { useEffect, useRef, useState } from 'react';

import { createDefaultImportManagerSettings, type ImportManagerSettings } from '../../../lib/core/import/importManagerSettings';
import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { selectRuntimeImportDirectory } from '../../shared/platform/importBridge';

import {
  applyReadwiseRootPath,
  cloneDraftImportSource,
  createNextImportSourceIndex,
  type DraftImportSource,
  type DraftImportSourceField,
  updateDraftImportSource
} from './importSourceWorkspaceModel';
import {
  loadImportSourceWorkspaceSettings,
  saveImportSourceWorkspaceSettings
} from './importSourceWorkspaceSettings';

function replaceSource(
  sources: DraftImportSource[],
  sourceId: string,
  updater: (source: DraftImportSource) => DraftImportSource
) {
  return sources.map((source) => (source.id === sourceId ? updater(source) : source));
}

function usePersistedImportSourceWorkspaceSettings() {
  const [settings, setSettings] = useState<ImportManagerSettings>(createDefaultImportManagerSettings);
  const hydratedRef = useRef(false);
  const localChangesRef = useRef(false);

  const setDirtySettings: typeof setSettings = (updater) => {
    localChangesRef.current = true;
    setSettings(updater);
  };

  useEffect(() => {
    let active = true;
    void loadImportSourceWorkspaceSettings().then((nextSettings) => {
      if (!active) {
        return;
      }
      hydratedRef.current = true;
      if (localChangesRef.current) {
        return;
      }
      setSettings((current) =>
        JSON.stringify(current) === JSON.stringify(nextSettings) ? current : nextSettings
      );
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || !localChangesRef.current) {
      return;
    }
    void saveImportSourceWorkspaceSettings(settings);
  }, [settings]);

  return [settings, setDirtySettings] as const;
}

async function selectFolderPath() {
  return selectRuntimeImportDirectory();
}

function createGenericActions(setSettings: ReturnType<typeof usePersistedImportSourceWorkspaceSettings>[1]) {
  const handleChangeSource = (sourceId: string, field: DraftImportSourceField, value: string) => {
    setSettings((current) => ({
      ...current,
      sources: replaceSource(current.sources, sourceId, (source) => updateDraftImportSource(source, field, value))
    }));
  };

  return {
    handleChangeAction: async (sourceId: string, value: string) => {
      if (value !== 'move') {
        handleChangeSource(sourceId, 'actionMode', value);
        return;
      }
      const selectedPath = await selectFolderPath();
      if (!selectedPath) {
        return;
      }
      setSettings((current) => ({
        ...current,
        sources: replaceSource(current.sources, sourceId, (source) => ({
          ...updateDraftImportSource(source, 'actionMode', 'move'),
          archivePath: selectedPath
        }))
      }));
    },
    handleChangeSource,
    handleChooseFolder: async (sourceId: string, field: 'primaryPath' | 'highlightPath') => {
      const selectedPath = await selectFolderPath();
      if (!selectedPath) {
        return;
      }
      handleChangeSource(sourceId, field, selectedPath);
    },
    handleCopySource: (sourceId: string) => {
      setSettings((current) => {
        const source = current.sources.find((entry) => entry.id === sourceId);
        if (!source) {
          return current;
        }
        return {
          ...current,
          sources: [...current.sources, cloneDraftImportSource(source, createNextImportSourceIndex(current.sources))]
        };
      });
    },
    handleDeleteSource: (sourceId: string) => {
      setSettings((current) => {
        if (current.sources.length <= 1) {
          return current;
        }
        return {
          ...current,
          sources: current.sources.filter((source) => source.id !== sourceId)
        };
      });
    }
  };
}

function createReadwiseActions(setSettings: ReturnType<typeof usePersistedImportSourceWorkspaceSettings>[1]) {
  const handleChangeReadwiseSource = (sourceId: string, field: DraftImportSourceField, value: string) => {
    setSettings((current) => ({
      ...current,
      readwiseSources: replaceSource(current.readwiseSources, sourceId, (source) => updateDraftImportSource(source, field, value))
    }));
  };

  return {
    handleChangeReadwiseAction: async (sourceId: string, value: string) => {
      if (value !== 'move') {
        handleChangeReadwiseSource(sourceId, 'actionMode', value);
        return;
      }
      const selectedPath = await selectFolderPath();
      if (!selectedPath) {
        return;
      }
      setSettings((current) => ({
        ...current,
        readwiseSources: replaceSource(current.readwiseSources, sourceId, (source) => ({
          ...updateDraftImportSource(source, 'actionMode', 'move'),
          archivePath: selectedPath
        }))
      }));
    },
    handleChangeReadwiseSource,
    handleChooseReadwiseFolder: async (sourceId: string, field: 'primaryPath' | 'highlightPath') => {
      const selectedPath = await selectFolderPath();
      if (!selectedPath) {
        return;
      }
      handleChangeReadwiseSource(sourceId, field, selectedPath);
    },
    handleChooseReadwiseRootFolder: async () => {
      const selectedPath = await selectFolderPath();
      if (!selectedPath) {
        return;
      }
      setSettings((current) => ({
        ...current,
        readwiseRootPath: selectedPath,
        readwiseSources: applyReadwiseRootPath(current.readwiseSources, selectedPath)
      }));
    }
  };
}

function createDetailsSetter(setSettings: ReturnType<typeof usePersistedImportSourceWorkspaceSettings>[1]) {
  return (updater: (current: boolean) => boolean) => {
    setSettings((current) => ({
      ...current,
      detailsOpen: updater(current.detailsOpen)
    }));
  };
}

function createReadwiseReaderConfigActions(setSettings: ReturnType<typeof usePersistedImportSourceWorkspaceSettings>[1]) {
  return {
    handleSaveReadwiseReaderConfig: (config: ReadwiseReaderConfig) => {
      setSettings((current) => ({
        ...current,
        readwiseReaderConfig: config
      }));
    }
  };
}

export function useImportSourceWorkspaceState() {
  const [settings, setSettings] = usePersistedImportSourceWorkspaceSettings();
  const genericActions = createGenericActions(setSettings);
  const readwiseActions = createReadwiseActions(setSettings);
  const readwiseReaderConfigActions = createReadwiseReaderConfigActions(setSettings);

  return {
    detailsOpen: settings.detailsOpen,
    ...genericActions,
    ...readwiseActions,
    ...readwiseReaderConfigActions,
    readwiseReaderConfig: settings.readwiseReaderConfig,
    readwiseRootPath: settings.readwiseRootPath,
    readwiseSources: settings.readwiseSources,
    setDetailsOpen: createDetailsSetter(setSettings),
    sources: settings.sources
  };
}
