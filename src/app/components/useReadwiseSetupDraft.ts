import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type { NativeReadwiseDetectionResult, NativeReadwiseDetectionSource } from '../../../lib/platform/nativeReadwiseContract';
import { selectRuntimeFolder } from '../../shared/platform/folderSelectionRuntimeRepository';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { applyReadwiseRootPath, formatReadwiseSourceLabel, updateDraftImportSource } from './importSourceWorkspaceModel';

function getReadwiseDetectionSources(sources: DraftImportSource[]): NativeReadwiseDetectionSource[] {
  return sources
    .filter((source): source is DraftImportSource & { kind: NonNullable<DraftImportSource['kind']> } =>
      Boolean(source.kind && source.highlightPath.trim() && source.primaryPath.trim())
    )
    .map((source) => ({
      articleDirectoryPath: source.highlightPath,
      fullDocumentDirectoryPath: source.primaryPath,
      label: formatReadwiseSourceLabel(source.kind)
    }));
}

async function chooseDraftFolder(
  sourceId: string,
  field: 'highlightPath' | 'primaryPath',
  setDraftSources: Dispatch<SetStateAction<DraftImportSource[]>>
): Promise<boolean> {
  const selectedPath = await selectRuntimeFolder();
  if (!selectedPath) {
    return false;
  }
  setDraftSources((current) => current.map((source) => (source.id === sourceId ? updateDraftImportSource(source, field, selectedPath) : source)));
  return true;
}

async function chooseDraftRootFolder(
  setDraftRootPath: Dispatch<SetStateAction<string>>,
  setDraftSources: Dispatch<SetStateAction<DraftImportSource[]>>
): Promise<boolean> {
  const selectedPath = await selectRuntimeFolder();
  if (!selectedPath) {
    return false;
  }
  setDraftRootPath(selectedPath);
  setDraftSources((current) => applyReadwiseRootPath(current, selectedPath));
  return true;
}

async function runDraftPreview(input: {
  config: ReadwiseReaderConfig;
  draftSources: DraftImportSource[];
  onPreview: (input: {
    articleDirectoryPath: string;
    config: ReadwiseReaderConfig;
    fullDocumentDirectoryPath: string;
    sources: NativeReadwiseDetectionSource[];
  }) => Promise<NativeReadwiseDetectionResult>;
  setIsPreviewing: Dispatch<SetStateAction<boolean>>;
  setPreviewResult: Dispatch<SetStateAction<NativeReadwiseDetectionResult | null>>;
}) {
  const sources = getReadwiseDetectionSources(input.draftSources);
  const firstSource = sources[0];
  if (!firstSource) {
    return;
  }
  input.setIsPreviewing(true);
  try {
    const result = await input.onPreview({
      articleDirectoryPath: firstSource.articleDirectoryPath,
      config: input.config,
      fullDocumentDirectoryPath: firstSource.fullDocumentDirectoryPath,
      sources
    });
    input.setPreviewResult(result);
  } finally {
    input.setIsPreviewing(false);
  }
}

function areReadwiseDraftsEqual(input: {
  draftConfig: ReadwiseReaderConfig;
  draftRootPath: string;
  draftSources: DraftImportSource[];
  savedConfig: ReadwiseReaderConfig;
  savedRootPath: string;
  savedSources: DraftImportSource[];
}) {
  return (
    input.draftRootPath === input.savedRootPath &&
    JSON.stringify(input.draftConfig) === JSON.stringify(input.savedConfig) &&
    JSON.stringify(input.draftSources) === JSON.stringify(input.savedSources)
  );
}

function createReadwiseDraftActions(input: {
  draftConfig: ReadwiseReaderConfig;
  draftSources: DraftImportSource[];
  onPreview: (input: {
    articleDirectoryPath: string;
    config: ReadwiseReaderConfig;
    fullDocumentDirectoryPath: string;
    sources: NativeReadwiseDetectionSource[];
  }) => Promise<NativeReadwiseDetectionResult>;
  setDraftConfig: Dispatch<SetStateAction<ReadwiseReaderConfig>>;
  setDraftRootPath: Dispatch<SetStateAction<string>>;
  setDraftSources: Dispatch<SetStateAction<DraftImportSource[]>>;
  setIsPreviewing: Dispatch<SetStateAction<boolean>>;
  setPreviewResult: Dispatch<SetStateAction<NativeReadwiseDetectionResult | null>>;
}) {
  return {
    async chooseFolder(sourceId: string, field: 'highlightPath' | 'primaryPath') {
      const changed = await chooseDraftFolder(sourceId, field, input.setDraftSources);
      if (changed) {
        input.setPreviewResult(null);
      }
    },
    async chooseRootFolder() {
      const changed = await chooseDraftRootFolder(input.setDraftRootPath, input.setDraftSources);
      if (changed) {
        input.setPreviewResult(null);
      }
    },
    updateConfig(field: keyof ReadwiseReaderConfig, value: string) {
      if (field === 'validatedAt') return;
      input.setDraftConfig((current) => ({ ...current, [field]: value, validatedAt: '' }));
      input.setPreviewResult(null);
    },
    async runPreview() {
      await runDraftPreview({
        config: input.draftConfig,
        draftSources: input.draftSources,
        onPreview: input.onPreview,
        setIsPreviewing: input.setIsPreviewing,
        setPreviewResult: input.setPreviewResult
      });
    }
  };
}

export function useReadwiseSetupDraft(props: {
  config: ReadwiseReaderConfig;
  onPreview: (input: {
    articleDirectoryPath: string;
    config: ReadwiseReaderConfig;
    fullDocumentDirectoryPath: string;
    sources: NativeReadwiseDetectionSource[];
  }) => Promise<NativeReadwiseDetectionResult>;
  open: boolean;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}) {
  const [draftConfig, setDraftConfig] = useState(props.config);
  const [draftRootPath, setDraftRootPath] = useState(props.readwiseRootPath);
  const [draftSources, setDraftSources] = useState(props.readwiseSources);
  const [previewResult, setPreviewResult] = useState<NativeReadwiseDetectionResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const hasDraftChanges = !areReadwiseDraftsEqual({
    draftConfig,
    draftRootPath,
    draftSources,
    savedConfig: props.config,
    savedRootPath: props.readwiseRootPath,
    savedSources: props.readwiseSources
  });

  useEffect(() => {
    if (!props.open) {
      return;
    }
    setDraftConfig(props.config);
    setDraftRootPath(props.readwiseRootPath);
    setDraftSources(props.readwiseSources);
    setPreviewResult(null);
  }, [props.config, props.open, props.readwiseRootPath, props.readwiseSources]);

  return {
    draftConfig,
    draftRootPath,
    draftSources,
    hasDraftChanges,
    isPreviewing,
    previewResult,
    ...createReadwiseDraftActions({
      draftConfig,
      draftSources,
      onPreview: props.onPreview,
      setDraftConfig,
      setDraftRootPath,
      setDraftSources,
      setIsPreviewing,
      setPreviewResult
    })
  };
}
