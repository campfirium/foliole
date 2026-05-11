import {
  isReadwiseReaderConfigReady,
  type ReadwiseReaderConfig
} from '../../../lib/core/import/readwiseReaderSettings';
import type { NativeReadwiseDetectionResult } from '../../../lib/platform/nativeReadwiseContract';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { ReadwiseConfigDialogSurface } from './ReadwiseReaderConfigDialogSurface';
import { useReadwiseSetupDraft } from './useReadwiseSetupDraft';

interface ReadwiseReaderConfigDialogProps {
  config: ReadwiseReaderConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPreview: (input: {
    articleDirectoryPath: string;
    config: ReadwiseReaderConfig;
    fullDocumentDirectoryPath: string;
    sources: Array<{
      articleDirectoryPath: string;
      fullDocumentDirectoryPath: string;
      label: string;
    }>;
  }) => Promise<NativeReadwiseDetectionResult>;
  onSave: (input: {
    config: ReadwiseReaderConfig;
    readwiseRootPath: string;
    readwiseSources: DraftImportSource[];
  }) => void;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}

function enableReadwiseImportSource(sources: DraftImportSource[]) {
  return sources.map((source) =>
    source.kind && source.highlightPath.trim() && source.primaryPath.trim()
      ? { ...source, keepState: 'enabled' as const }
      : source
  );
}

function disableReadwiseImportSource(sources: DraftImportSource[]) {
  return sources.map((source) =>
    source.kind ? { ...source, keepState: 'draft' as const } : source
  );
}

function getValidatedReadwiseConfig(draft: ReturnType<typeof useReadwiseSetupDraft>) {
  return draft.previewResult?.success
    ? { ...draft.draftConfig, validatedAt: new Date().toISOString() }
    : draft.draftConfig;
}

function canCheckReadwiseSetup(input: {
  config: ReadwiseReaderConfig;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}) {
  return (
    input.readwiseRootPath.trim().length > 0 &&
    input.readwiseSources.some((source) => source.kind) &&
    input.readwiseSources.every(
      (source) => !source.kind || Boolean(source.highlightPath.trim() && source.primaryPath.trim())
    ) &&
    input.config.highlightsHeading.trim().length > 0 &&
    input.config.newHighlightsHeading.trim().length > 0 &&
    input.config.highlightSeparator.trim().length > 0 &&
    input.config.tagKeyword.trim().length > 0 &&
    input.config.noteKeyword.trim().length > 0
  );
}

export function ReadwiseReaderConfigDialog(props: ReadwiseReaderConfigDialogProps) {
  const draft = useReadwiseSetupDraft(props);
  const canPreview = canCheckReadwiseSetup({
    config: draft.draftConfig,
    readwiseRootPath: draft.draftRootPath,
    readwiseSources: draft.draftSources
  });

  function saveReadwiseSetup(readwiseSources: DraftImportSource[]) {
    props.onSave({
      config: draft.draftConfig,
      readwiseRootPath: draft.draftRootPath,
      readwiseSources
    });
  }

  function saveReadwiseSetupWithConfig(
    readwiseSources: DraftImportSource[],
    config: ReadwiseReaderConfig
  ) {
    props.onSave({
      config,
      readwiseRootPath: draft.draftRootPath,
      readwiseSources
    });
  }

  const configured =
    props.readwiseRootPath.trim().length > 0 && isReadwiseReaderConfigReady(props.config);
  const integrationEnabled = props.config.enabled;
  const canChangeIntegration =
    integrationEnabled ||
    Boolean(draft.previewResult?.success) ||
    (configured && !draft.hasDraftChanges);

  return props.open ? (
    <ReadwiseConfigDialogSurface
      canChangeIntegration={canChangeIntegration}
      canPreview={canPreview}
      draft={draft}
      integrationEnabled={integrationEnabled}
      onCancel={() => props.onOpenChange(false)}
      onChangeIntegration={() => {
        saveReadwiseSetupWithConfig(
          integrationEnabled
            ? disableReadwiseImportSource(draft.draftSources)
            : enableReadwiseImportSource(draft.draftSources),
          integrationEnabled
            ? { ...draft.draftConfig, enabled: false }
            : { ...getValidatedReadwiseConfig(draft), enabled: true }
        );
      }}
      onCheck={() => {
        saveReadwiseSetup(draft.draftSources);
        void draft.runPreview();
      }}
    />
  ) : null;
}
