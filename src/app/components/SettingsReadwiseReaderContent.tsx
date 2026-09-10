import { useEffect, useState } from 'react';

import type { ReadwiseSourceMode } from '../../../lib/core/import/importManagerSettings';
import type {
  ReadwiseAutoImportPolicy,
  ReadwiseImportDestination
} from '../../../lib/core/import/readwiseAutoImportPolicy';
import { createDefaultReadwiseAutoImportPolicy } from '../../../lib/core/import/readwiseAutoImportPolicy';
import type {
  ReadwiseReaderConfig,
  ReadwiseSyncFrequency
} from '../../../lib/core/import/readwiseReaderSettings';
import type {
  NativeReadwiseCleanupPreviewResult,
  NativeReadwiseCleanupRunResult,
  NativeReadwiseImportRunResult,
  NativeReadwiseSyncPreviewResult
} from '../../../lib/platform/nativeImportContract';
import { definedProps } from '../../shared/lib/definedProps';
import { useActiveSyncGroup } from '../../shared/platform/external/useActiveSyncGroup';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import type { ReadwiseApiModeSettings } from './ReadwiseApiModeSettingsRows';
import { ReadwiseCleanupDialog } from './ReadwiseCleanupDialog';
import { ReadwiseBehaviorSection, ReadwiseFolderSettingsSections } from './ReadwiseFolderSettingsSections';
import { ReadwiseHostAssignmentRow, useReadwiseHostAssignment } from './ReadwiseHostAssignmentRow';
import { ReadwiseSourceModeSection } from './ReadwiseSourceModeSection';
import { ReadwiseSyncPreviewDialog } from './ReadwiseSyncPreviewDialog';
import { useReadwiseCleanup } from './useReadwiseCleanup';
import {
  useReadwiseSetupController,
  type ReadwiseSetupPayload
} from './useReadwiseSetupController';
import type { useReadwiseSetupDraft } from './useReadwiseSetupDraft';
import {
  createReadwiseSetupPayload,
  disableReadwiseImportSource
} from './useReadwiseSyncPreviewFlow';

type ReadwiseSetupDraft = ReturnType<typeof useReadwiseSetupDraft>;

interface SettingsReadwiseReaderContentProps {
  config: ReadwiseReaderConfig;
  onPreviewCleanup?: () => Promise<NativeReadwiseCleanupPreviewResult | null>;
  onPreviewSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseSyncPreviewResult | null>;
  onCancelSync?: () => Promise<unknown>;
  onRunCleanup?: () => Promise<NativeReadwiseCleanupRunResult | null>;
  onRunSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseImportRunResult | null>;
  onSave: (input: ReadwiseSetupPayload) => void;
  onChangeSourceMode?: (mode: ReadwiseSourceMode) => void;
  onChangePolicy?: (
    field: Exclude<keyof ReadwiseAutoImportPolicy, 'version'>,
    value: ReadwiseImportDestination
  ) => void;
  policy?: ReadwiseAutoImportPolicy;
  readwiseRootPath: string;
  readwiseSourceMode?: ReadwiseSourceMode;
  readwiseSources: DraftImportSource[];
}

function saveDisabledReadwiseSetup(props: SettingsReadwiseReaderContentProps, draft: ReadwiseSetupDraft) {
  props.onSave(createReadwiseSetupPayload(
    draft,
    { ...draft.draftConfig, enabled: false },
    disableReadwiseImportSource(draft.draftSources)
  ));
}

function ReadwiseSelectedModeContent(props: {
  cleanup: ReturnType<typeof useReadwiseCleanup>;
  settings: SettingsReadwiseReaderContentProps;
  setup: ReturnType<typeof useReadwiseSetupController>;
  sourceMode: ReadwiseSourceMode;
}) {
  if (props.sourceMode === 'off') return null;
  if (props.sourceMode === 'api') {
    return (
      <ReadwiseBehaviorSection
        onChange={props.settings.onChangePolicy ?? (() => undefined)}
        policy={props.settings.policy ?? createDefaultReadwiseAutoImportPolicy()}
      />
    );
  }
  return (
    <ReadwiseFolderSettingsSections
      canPreview={props.setup.canPreview}
      draft={props.setup.draft}
      integrationEnabled={props.setup.integrationEnabled}
      cleanupDisabled={props.cleanup.cleanupDisabled}
      onCleanup={() => void props.cleanup.openCleanupDialog()}
      onChangePolicy={props.settings.onChangePolicy ?? (() => undefined)}
      onChangeIntegration={props.setup.handleChangeIntegration}
      onCheck={props.setup.handleCheck}
      onSync={() => void props.setup.handleRunSync()}
      policy={props.settings.policy ?? createDefaultReadwiseAutoImportPolicy()}
      syncStatus={props.setup.manualSyncStatus}
      syncDisabled={props.setup.syncDisabled}
      syncIsRunning={props.setup.syncIsRunning}
    />
  );
}

function createApiModeSettings(
  setup: ReturnType<typeof useReadwiseSetupController>,
  cleanup: ReturnType<typeof useReadwiseCleanup>,
  onChangeFrequency: (frequency: ReadwiseSyncFrequency) => void
): ReadwiseApiModeSettings {
  return {
    cleanupDisabled: cleanup.cleanupDisabled,
    config: setup.draft.draftConfig,
    onChangeFrequency,
    onCleanup: () => void cleanup.openCleanupDialog(),
    onSync: () => void setup.handleRunSync(),
    syncDisabled: setup.syncDisabled,
    syncIsRunning: setup.syncIsRunning,
    syncStatus: setup.manualSyncStatus
  };
}

function ReadwiseLocalSettingsContent(props: SettingsReadwiseReaderContentProps) {
  const setup = useReadwiseSetupController(props);
  const committedMode = props.readwiseSourceMode ?? 'folder';
  const [sourceMode, setSourceMode] = useState(committedMode);
  useEffect(() => setSourceMode(committedMode), [committedMode]);
  const cleanup = useReadwiseCleanup({
    onCleanupComplete: () => saveDisabledReadwiseSetup(props, setup.draft),
    ...definedProps({
      onPreviewCleanup: props.onPreviewCleanup,
      onRunCleanup: props.onRunCleanup
    })
  });
  function saveApiFrequency(syncFrequency: ReadwiseSyncFrequency) {
    const draft = setup.draft;
    const config = { ...draft.draftConfig, syncFrequency };
    draft.updateConfig('syncFrequency', syncFrequency);
    props.onSave(createReadwiseSetupPayload(draft, config, draft.draftSources));
  }
  const apiSettings = createApiModeSettings(setup, cleanup, saveApiFrequency);
  return (
    <>
      <ReadwiseSourceModeSection
        committedMode={committedMode}
        apiSettings={apiSettings}
        mode={sourceMode}
        onChange={setSourceMode}
        {...(props.onChangeSourceMode ? { onCommitMode: props.onChangeSourceMode } : {})}
      />
      <ReadwiseSelectedModeContent
        cleanup={cleanup}
        settings={props}
        setup={setup}
        sourceMode={sourceMode}
      />
      <ReadwiseSyncPreviewDialog
        error={setup.syncError}
        isCancelling={setup.isCancellingSync}
        isPreviewing={setup.isSyncPreviewing}
        isStarting={setup.isStartingSync}
        notice={setup.syncNotice}
        onCancel={setup.closeSyncPreview}
        onStart={setup.startSync}
        open={setup.syncIntent !== null}
        progress={setup.syncProgress}
        preview={setup.syncPreview}
      />
      <ReadwiseCleanupDialog
        error={cleanup.cleanupError}
        isRunning={cleanup.isCleanupRunning}
        onCancel={cleanup.closeCleanupDialog}
        onRun={() => void cleanup.runCleanup()}
        open={cleanup.isCleanupDialogOpen}
        preview={cleanup.cleanupPreview}
      />
    </>
  );
}

export function SettingsReadwiseReaderContent(props: SettingsReadwiseReaderContentProps) {
  const hostAssignment = useReadwiseHostAssignment();
  const hasActiveSyncGroup = useActiveSyncGroup();
  if (hasActiveSyncGroup && hostAssignment.assignment?.is_active === false) {
    return (
      <ReadwiseHostAssignmentRow
        assignment={hostAssignment.assignment}
        onActivate={() => void hostAssignment.activate()}
      />
    );
  }
  return <ReadwiseLocalSettingsContent {...props} />;
}
