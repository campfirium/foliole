import {
  isReadwiseReaderConfigReady,
  type ReadwiseReaderConfig
} from '../../../lib/core/import/readwiseReaderSettings';
import {
  AppButton,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection
} from '../../shared/ui';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { ReadwiseReaderImportBehavior } from './ReadwiseReaderImportBehavior';
import {
  ReadwiseIntegrationSwitch,
  ReadwiseReaderSetupCheckPanel
} from './ReadwiseReaderSetupCheckPanel';
import { inspectReadwiseReaderSetup } from './readwiseReaderSetupInspection';
import { ReadwiseDirectorySection, ReadwiseParserFields } from './ReadwiseReaderSetupParts';
import { ReadwiseReaderSyncRow } from './ReadwiseReaderSyncControls';
import { useReadwiseSetupDraft } from './useReadwiseSetupDraft';

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

function canPreviewReadwiseSetup(input: {
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

function getValidatedReadwiseConfig(draft: ReturnType<typeof useReadwiseSetupDraft>) {
  return draft.previewResult?.success
    ? { ...draft.draftConfig, validatedAt: new Date().toISOString() }
    : draft.draftConfig;
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
        title="Readwise Reader Import"
      >
        <ReadwiseReaderSetupCheckPanel
          canCheck={props.canPreview}
          hasDraftChanges={props.draft.hasDraftChanges}
          isChecking={props.draft.isPreviewing}
          onCheck={props.onCheck}
          result={props.draft.previewResult}
        />
        <ReadwiseReaderSyncRow
          config={props.draft.draftConfig}
          onChange={props.draft.updateConfig}
        />
        <ReadwiseCleanupRow />
      </SettingsSection>
      <SettingsSection ariaLabel="Readwise Reader import behavior" title="Import behavior">
        <ReadwiseReaderImportBehavior
          config={props.draft.draftConfig}
          onChange={props.draft.updateConfig}
        />
      </SettingsSection>
      <SettingsSection ariaLabel="Readwise Reader import settings" title="Import settings">
        <ReadwiseDirectorySection
          onChooseFolder={props.draft.chooseFolder}
          onChooseRootFolder={props.draft.chooseRootFolder}
          readwiseRootPath={props.draft.draftRootPath}
          sources={props.draft.draftSources}
        />
        <ReadwiseParserFields
          config={props.draft.draftConfig}
          onChange={props.draft.updateConfig}
        />
      </SettingsSection>
    </div>
  );
}

function ReadwiseCleanupRow() {
  return (
    <SettingsRow
      description="Remove unchanged Readwise imports and keep changed topics in Foliole."
      title="Clean up imports"
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <AppButton disabled size="sm" variant="primary">
          Clean up...
        </AppButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

interface SettingsReadwiseReaderContentProps {
  config: ReadwiseReaderConfig;
  onSave: (input: {
    config: ReadwiseReaderConfig;
    readwiseRootPath: string;
    readwiseSources: DraftImportSource[];
  }) => void;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}

function useReadwiseSetupController(props: SettingsReadwiseReaderContentProps) {
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
  const configured =
    props.readwiseRootPath.trim().length > 0 && isReadwiseReaderConfigReady(props.config);
  const integrationEnabled = props.config.enabled;
  const canChangeIntegration =
    integrationEnabled ||
    Boolean(draft.previewResult?.success) ||
    (configured && !draft.hasDraftChanges);

  function saveReadwiseSetup(readwiseSources: DraftImportSource[], config: ReadwiseReaderConfig) {
    props.onSave({
      config,
      readwiseRootPath: draft.draftRootPath,
      readwiseSources
    });
  }

  function handleChangeIntegration() {
    saveReadwiseSetup(
      integrationEnabled
        ? disableReadwiseImportSource(draft.draftSources)
        : enableReadwiseImportSource(draft.draftSources),
      integrationEnabled
        ? { ...draft.draftConfig, enabled: false }
        : { ...getValidatedReadwiseConfig(draft), enabled: true }
    );
  }

  function handleCheck() {
    saveReadwiseSetup(draft.draftSources, draft.draftConfig);
    void draft.runPreview();
  }

  return {
    canChangeIntegration,
    canPreview,
    draft,
    handleChangeIntegration,
    handleCheck,
    integrationEnabled
  };
}

export function SettingsReadwiseReaderContent(props: SettingsReadwiseReaderContentProps) {
  const setup = useReadwiseSetupController(props);

  return (
    <ReadwiseSetupSection
      canChangeIntegration={setup.canChangeIntegration}
      canPreview={setup.canPreview}
      draft={setup.draft}
      integrationEnabled={setup.integrationEnabled}
      onChangeIntegration={setup.handleChangeIntegration}
      onCheck={setup.handleCheck}
    />
  );
}
