import { useEffect, useRef, useState } from 'react';

import {
  createDefaultImportManagerSettings,
  type ImportManagerSettings,
  type ImportNodeTitleStrategy,
  type KeepImportPreviewSummary
} from '../../../lib/core/import/importManagerSettings';
import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { previewRuntimeKeepImportRule, selectRuntimeImportDirectory } from '../../shared/platform/importBridge';

import {
  applyReadwiseRootPath,
  cloneDraftImportSource,
  createNextImportSourceIndex,
  type DraftImportSource,
  type DraftImportSourceField,
  updateDraftImportSource
} from './importSourceWorkspaceModel';
import { loadImportSourceWorkspaceSettings, saveImportSourceWorkspaceSettings } from './importSourceWorkspaceSettings';
type SetSettings = ReturnType<typeof usePersistedImportSourceWorkspaceSettings>[1];

function replaceSource(
  sources: DraftImportSource[],
  sourceId: string,
  updater: (source: DraftImportSource) => DraftImportSource
) {
  return sources.map((source) => (source.id === sourceId ? updater(source) : source));
}

function toKeepPreviewSummary(result: NonNullable<Awaited<ReturnType<typeof previewRuntimeKeepImportRule>>>) {
  return {
    blockedCount: result.blockedCount,
    discoveredCount: result.discoveredCount,
    failedCount: result.failedCount,
    newCount: result.newCount,
    previewedAt: result.previewedAt,
    samples: result.entries.slice(0, 6).map((entry) => ({
      contentPreview: entry.contentPreview,
      detail: entry.detail,
      detectedHighlightCount: entry.detectedHighlightCount,
      highlightSamples: entry.highlightSamples,
      sourcePath: entry.sourcePath,
      status: entry.status
    })),
    unchangedCount: result.unchangedCount,
    updatedCount: result.updatedCount
  } satisfies KeepImportPreviewSummary;
}

function usePersistedImportSourceWorkspaceSettings() {
  const [settings, setSettings] = useState<ImportManagerSettings>(createDefaultImportManagerSettings);
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
      setSettings((current) => (JSON.stringify(current) === JSON.stringify(nextSettings) ? current : nextSettings));
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
  return selectRuntimeImportDirectory();
}

function createGenericSourceActions(setSettings: SetSettings) {
  const handleChangeSource = (sourceId: string, field: DraftImportSourceField, value: string) => {
    setSettings((current) => ({
      ...current,
      sources: replaceSource(current.sources, sourceId, (source) => updateDraftImportSource(source, field, value))
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
          sources: [...current.sources, cloneDraftImportSource(source, createNextImportSourceIndex(current.sources))]
        };
      });
    },
    handleDeleteSource(sourceId: string) {
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

function createReadwiseSourceActions(setSettings: SetSettings) {
  const handleChangeReadwiseSource = (sourceId: string, field: DraftImportSourceField, value: string) => {
    setSettings((current) => ({
      ...current,
      readwiseSources: replaceSource(current.readwiseSources, sourceId, (source) => updateDraftImportSource(source, field, value))
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

function createKeepImportActions(settings: ImportManagerSettings, setSettings: SetSettings) {
  return {
    handleConfirmKeepImport(sourceId: string, scope: 'readwiseSources' | 'sources') {
      setSettings((current) => ({
        ...current,
        [scope]: replaceSource(current[scope], sourceId, (source) => (source.keepPreview ? { ...source, keepState: 'enabled' } : source))
      }));
    },
    handleDisableKeepImport(sourceId: string, scope: 'readwiseSources' | 'sources') {
      setSettings((current) => ({
        ...current,
        [scope]: replaceSource(current[scope], sourceId, (source) => ({
          ...source,
          keepState: source.keepPreview ? 'previewed' : 'draft'
        }))
      }));
    },
    async handlePreviewKeepImport(sourceId: string, scope: 'readwiseSources' | 'sources') {
      const source = settings[scope].find((entry) => entry.id === sourceId);
      if (!source?.primaryPath.trim()) {
        return null;
      }
      const result = await previewRuntimeKeepImportRule({
        directoryPath: source.primaryPath,
        highlightPolicy: scope === 'sources' && source.highlightMode === 'merged' ? 'adopt' : 'reference_only',
        ruleId: source.id,
        sourceType: scope === 'readwiseSources' ? 'readwise' : 'generic'
      });
      if (!result) {
        return null;
      }
      const preview = toKeepPreviewSummary(result);
      setSettings((current) => ({
        ...current,
        [scope]: replaceSource(current[scope], sourceId, (entry) => ({
          ...entry,
          keepPreview: preview,
          keepState: 'previewed'
        }))
      }));
      return preview;
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
    ...createGenericSourceActions(setSettings),
    ...createKeepImportActions(settings, setSettings),
    ...createReadwiseSourceActions(setSettings),
    ...createWorkspaceMetaActions(setSettings),
    readwiseReaderConfig: settings.readwiseReaderConfig,
    readwiseRootPath: settings.readwiseRootPath,
    readwiseSources: settings.readwiseSources,
    sources: settings.sources,
    titleStrategy: settings.titleStrategy
  };
}
