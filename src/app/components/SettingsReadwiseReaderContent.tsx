import { isReadwiseReaderConfigReady, type ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { SettingsSection } from '../../shared/ui';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { ReadwiseIntegrationSwitch, ReadwiseReaderSetupCheckPanel } from './ReadwiseReaderSetupCheckPanel';
import { inspectReadwiseReaderSetup } from './readwiseReaderSetupInspection';
import { ReadwiseDirectorySection, ReadwiseParserFields } from './ReadwiseReaderSetupParts';
import { useReadwiseSetupDraft } from './useReadwiseSetupDraft';

function enableReadwiseImportSource(sources: DraftImportSource[]) {
  return sources.map((source) =>
    source.kind && source.highlightPath.trim() && source.primaryPath.trim()
      ? { ...source, keepState: 'enabled' as const }
      : source
  );
}

function disableReadwiseImportSource(sources: DraftImportSource[]) {
  return sources.map((source) => (source.kind ? { ...source, keepState: 'draft' as const } : source));
}

function canPreviewReadwiseSetup(input: {
  config: ReadwiseReaderConfig;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}) {
  return (
    input.readwiseRootPath.trim().length > 0 &&
    input.readwiseSources.some((source) => source.kind) &&
    input.readwiseSources.every((source) => !source.kind || Boolean(source.highlightPath.trim() && source.primaryPath.trim())) &&
    input.config.highlightsHeading.trim().length > 0 &&
    input.config.newHighlightsHeading.trim().length > 0 &&
    input.config.highlightSeparator.trim().length > 0 &&
    input.config.tagKeyword.trim().length > 0 &&
    input.config.noteKeyword.trim().length > 0
  );
}

function getValidatedReadwiseConfig(draft: ReturnType<typeof useReadwiseSetupDraft>) {
  return draft.previewResult?.success
    ? { ...draft.draftConfig, validatedAt: new Date().toISOString() }
    : draft.draftConfig;
}

function isReadwiseIntegrationEnabled(sources: DraftImportSource[]) {
  const readwiseSources = sources.filter((source) => source.kind);
  return readwiseSources.length > 0 && readwiseSources.every((source) => source.keepState === 'enabled');
}

function ReadwiseSetupSection(props: {
  canChangeIntegration: boolean;
  canPreview: boolean;
  draft: ReturnType<typeof useReadwiseSetupDraft>;
  integrationEnabled: boolean;
  onChangeIntegration: () => void;
  onCheck: () => void;
}) {
  return (
    <div className="space-y-6">
      <SettingsSection
        actions={
          <ReadwiseIntegrationSwitch
            disabled={!props.canChangeIntegration}
            enabled={props.integrationEnabled}
            onToggle={props.onChangeIntegration}
          />
        }
        ariaLabel="Readwise Reader import setup"
        description="Readwise Reader for Obsidian folder import."
        title="Readwise Reader integration"
      >
        <ReadwiseReaderSetupCheckPanel
          canCheck={props.canPreview}
          hasDraftChanges={props.draft.hasDraftChanges}
          isChecking={props.draft.isPreviewing}
          onCheck={props.onCheck}
          result={props.draft.previewResult}
        />
        <ReadwiseDirectorySection
          onChooseFolder={props.draft.chooseFolder}
          onChooseRootFolder={props.draft.chooseRootFolder}
          readwiseRootPath={props.draft.draftRootPath}
          sources={props.draft.draftSources}
        />
        <ReadwiseParserFields config={props.draft.draftConfig} onChange={props.draft.updateConfig} />
      </SettingsSection>
    </div>
  );
}

export function SettingsReadwiseReaderContent(props: {
  config: ReadwiseReaderConfig;
  onSave: (input: {
    config: ReadwiseReaderConfig;
    readwiseRootPath: string;
    readwiseSources: DraftImportSource[];
  }) => void;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}) {
  const draft = useReadwiseSetupDraft({
    config: props.config,
    onPreview: (input) =>
      inspectReadwiseReaderSetup({
        articleDirectoryPath: input.articleDirectoryPath,
        config: input.config,
        fullDocumentDirectoryPath: input.fullDocumentDirectoryPath,
        sources: input.sources
      }),
    open: true,
    readwiseRootPath: props.readwiseRootPath,
    readwiseSources: props.readwiseSources
  });
  const canPreview = canPreviewReadwiseSetup({
    config: draft.draftConfig,
    readwiseRootPath: draft.draftRootPath,
    readwiseSources: draft.draftSources
  });
  const configured = props.readwiseRootPath.trim().length > 0 && isReadwiseReaderConfigReady(props.config);
  const integrationEnabled = isReadwiseIntegrationEnabled(props.readwiseSources);
  const canChangeIntegration = integrationEnabled || Boolean(draft.previewResult?.success) || (configured && !draft.hasDraftChanges);

  function saveReadwiseSetup(readwiseSources: DraftImportSource[], config = draft.draftConfig) {
    props.onSave({
      config,
      readwiseRootPath: draft.draftRootPath,
      readwiseSources
    });
  }

  return (
    <ReadwiseSetupSection
      canChangeIntegration={canChangeIntegration}
      canPreview={canPreview}
      draft={draft}
      integrationEnabled={integrationEnabled}
      onChangeIntegration={() =>
        saveReadwiseSetup(
          integrationEnabled ? disableReadwiseImportSource(draft.draftSources) : enableReadwiseImportSource(draft.draftSources),
          integrationEnabled ? draft.draftConfig : getValidatedReadwiseConfig(draft)
        )
      }
      onCheck={() => {
        saveReadwiseSetup(draft.draftSources);
        void draft.runPreview();
      }}
    />
  );
}
