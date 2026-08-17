import { useEffect, useRef, useState } from 'react';

import {
  createDefaultImportManagerSettings,
  type ImportManagerSettings,
  type ImportNodeTitleStrategy,
} from '../../../lib/core/import/importManagerSettings';
import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { selectRuntimeFolder } from '../../shared/platform/folderSelectionRuntimeRepository';

import { createGenericSourceActions, replaceSource } from './importSourceGenericActions';
import { createKeepImportActions } from './importSourceKeepActions';
import { createReadwiseReaderImportActions } from './importSourceReadwiseRuntimeActions';
import {
  cloneDraftImportSource,
  applyReadwiseRootPath,
  type DraftImportSource,
  type DraftImportSourceField,
  updateDraftImportSource
} from './importSourceWorkspaceModel';
import {
  loadImportSourceWorkspaceSettings,
  saveImportSourceWorkspaceSettings
} from './importSourceWorkspaceSettings';
type SetSettings = ReturnType<typeof usePersistedImportSourceWorkspaceSettings>[1];

function usePersistedImportSourceWorkspaceSettings() {
  const [settings, setSettings] = useState<ImportManagerSettings>(
    createDefaultImportManagerSettings
  );
  const [hydrated, setHydrated] = useState(false);
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
      setHydrated(true);
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
    if (!hydrated || !localChangesRef.current) {
      return;
    }
    void saveImportSourceWorkspaceSettings(settings);
  }, [hydrated, settings]);
  return [settings, setDirtySettings] as const;
}

async function selectFolderPath() {
  return selectRuntimeFolder();
}

function createReadwiseSourceActions(setSettings: SetSettings) {
  const handleChangeReadwiseSource = (
    sourceId: string,
    field: DraftImportSourceField,
    value: string
  ) => {
    setSettings((current) => ({
      ...current,
      readwiseSources: replaceSource(current.readwiseSources, sourceId, (source) =>
        updateDraftImportSource(source, field, value)
      )
    }));
  };
  return {
    handleChangeReadwiseSource,
    async handleChooseReadwiseFolder(sourceId: string, field: 'primaryPath' | 'highlightPath') {
      const selectedPath = await selectFolderPath();
      if (selectedPath) {
        handleChangeReadwiseSource(sourceId, field, selectedPath);
      }
    },
    async handleChooseReadwiseRootFolder() {
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

function createWorkspaceMetaActions(setSettings: SetSettings) {
  return {
    handleSaveReadwiseReaderConfig(config: ReadwiseReaderConfig) {
      setSettings((current) => ({
        ...current,
        readwiseReaderConfig: config
      }));
    },
    handleSaveReadwiseReaderSetup(input: {
      config: ReadwiseReaderConfig;
      readwiseRootPath: string;
      readwiseSources: DraftImportSource[];
    }) {
      setSettings((current) => ({
        ...current,
        readwiseReaderConfig: input.config,
        readwiseRootPath: input.readwiseRootPath,
        readwiseSources: input.readwiseSources
      }));
    },
    handleChangeTitleStrategy(titleStrategy: ImportNodeTitleStrategy) {
      setSettings((current) => ({
        ...current,
        titleStrategy
      }));
    },
    setDetailsOpen(updater: (current: boolean) => boolean) {
      setSettings((current) => ({
        ...current,
        detailsOpen: updater(current.detailsOpen)
      }));
    }
  };
}

export function useImportSourceWorkspaceState() {
  const [settings, setSettings] = usePersistedImportSourceWorkspaceSettings();
  return {
    detailsOpen: settings.detailsOpen,
    handleClaimSource(sourceId: string) {
      setSettings((current) => {
        const source = current.sources.find((entry) => entry.id === sourceId);
        if (!source || source.ownership?.ownerInstallationId !== null) return current;
        return {
          ...current,
          sources: [...current.sources, cloneDraftImportSource(source)]
        };
      });
    },
    ...createGenericSourceActions(setSettings, selectFolderPath),
    ...createKeepImportActions(settings, setSettings),
    ...createReadwiseReaderImportActions(settings, setSettings),
    ...createReadwiseSourceActions(setSettings),
    ...createWorkspaceMetaActions(setSettings),
    handleTurnOffReadwise() {
      setSettings((current) => ({
        ...current,
        readwiseActiveDeviceName: null,
        readwiseActiveInstallationId: null
      }));
    },
    handleUseThisDeviceForReadwise() {
      setSettings((current) => ({
        ...current,
        readwiseActiveDeviceName: current.readwiseCurrentDeviceName,
        readwiseActiveInstallationId: current.readwiseCurrentInstallationId
      }));
    },
    readwiseActiveDeviceName: settings.readwiseActiveDeviceName,
    readwiseActiveInstallationId: settings.readwiseActiveInstallationId,
    readwiseCurrentDeviceName: settings.readwiseCurrentDeviceName,
    readwiseCurrentInstallationId: settings.readwiseCurrentInstallationId,
    readwiseReaderConfig: settings.readwiseReaderConfig,
    readwiseRootPath: settings.readwiseRootPath,
    readwiseSources: settings.readwiseSources,
    sources: settings.sources,
    titleStrategy: settings.titleStrategy
  };
}
