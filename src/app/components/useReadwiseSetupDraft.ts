import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type { NativeReadwiseDetectionResult } from '../../../lib/platform/nativeReadwiseContract';
import { selectRuntimeFolder } from '../../shared/platform/folderSelectionRuntimeRepository';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { applyReadwiseRootPath, updateDraftImportSource } from './importSourceWorkspaceModel';
import { getArticlesSource } from './ReadwiseReaderSetupParts';

async function chooseDraftFolder(
  sourceId: string,
  field: 'highlightPath' | 'primaryPath',
  setDraftSources: Dispatch<SetStateAction<DraftImportSource[]>>
) {
  const selectedPath = await selectRuntimeFolder();
  if (!selectedPath) {
    return;
  }
  setDraftSources((current) => current.map((source) => (source.id === sourceId ? updateDraftImportSource(source, field, selectedPath) : source)));
}

async function chooseDraftRootFolder(
  setDraftRootPath: Dispatch<SetStateAction<string>>,
  setDraftSources: Dispatch<SetStateAction<DraftImportSource[]>>
) {
  const selectedPath = await selectRuntimeFolder();
  if (!selectedPath) {
    return;
  }
  setDraftRootPath(selectedPath);
  setDraftSources((current) => applyReadwiseRootPath(current, selectedPath));
}

async function runDraftPreview(input: {
  config: ReadwiseReaderConfig;
  draftSources: DraftImportSource[];
  onPreview: (input: {
    articleDirectoryPath: string;
    config: ReadwiseReaderConfig;
    fullDocumentDirectoryPath: string;
  }) => Promise<NativeReadwiseDetectionResult>;
  setIsPreviewing: Dispatch<SetStateAction<boolean>>;
  setPreviewOpen: Dispatch<SetStateAction<boolean>>;
  setPreviewResult: Dispatch<SetStateAction<NativeReadwiseDetectionResult | null>>;
}) {
  const articlesSource = getArticlesSource(input.draftSources);
  if (!articlesSource?.highlightPath.trim() || !articlesSource.primaryPath.trim()) {
    return;
  }
  input.setIsPreviewing(true);
  try {
    const result = await input.onPreview({
      articleDirectoryPath: articlesSource.highlightPath,
      config: input.config,
      fullDocumentDirectoryPath: articlesSource.primaryPath
    });
    input.setPreviewResult(result);
    input.setPreviewOpen(true);
  } finally {
    input.setIsPreviewing(false);
  }
}

export function useReadwiseSetupDraft(props: {
  config: ReadwiseReaderConfig;
  onPreview: (input: {
    articleDirectoryPath: string;
    config: ReadwiseReaderConfig;
    fullDocumentDirectoryPath: string;
  }) => Promise<NativeReadwiseDetectionResult>;
  open: boolean;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}) {
  const [draftConfig, setDraftConfig] = useState(props.config);
  const [draftRootPath, setDraftRootPath] = useState(props.readwiseRootPath);
  const [draftSources, setDraftSources] = useState(props.readwiseSources);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<NativeReadwiseDetectionResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  useEffect(() => {
    if (!props.open) {
      return;
    }
    setDraftConfig(props.config);
    setDraftRootPath(props.readwiseRootPath);
    setDraftSources(props.readwiseSources);
    setPreviewOpen(false);
    setPreviewResult(null);
  }, [props.config, props.open, props.readwiseRootPath, props.readwiseSources]);

  return {
    draftConfig,
    draftRootPath,
    draftSources,
    isPreviewing,
    previewOpen,
    previewResult,
    async chooseFolder(sourceId: string, field: 'highlightPath' | 'primaryPath') {
      await chooseDraftFolder(sourceId, field, setDraftSources);
    },
    async chooseRootFolder() {
      await chooseDraftRootFolder(setDraftRootPath, setDraftSources);
    },
    closePreview() {
      setPreviewOpen(false);
    },
    updateConfig(field: keyof ReadwiseReaderConfig, value: string) {
      if (field === 'validatedAt') return;
      setDraftConfig((current) => ({ ...current, [field]: value, validatedAt: '' }));
    },
    async runPreview() {
      await runDraftPreview({
        config: draftConfig,
        draftSources,
        onPreview: props.onPreview,
        setIsPreviewing,
        setPreviewOpen,
        setPreviewResult
      });
    }
  };
}
