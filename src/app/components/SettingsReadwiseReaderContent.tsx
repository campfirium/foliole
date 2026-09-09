import { useEffect, useState } from 'react';

import type { ReadwiseSourceMode } from '../../../lib/core/import/importManagerSettings';
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
import { ReadwiseApiImportSection } from './ReadwiseApiImportSection';
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

function ReadwiseApiSettingsContent(props: {
  setup: ReturnType<typeof useReadwiseSetupController>;
  settings: SettingsReadwiseReaderContentProps;
}) {
  function saveFrequency(syncFrequency: ReadwiseSyncFrequency) {
    const draft = props.setup.draft;
    const config = { ...draft.draftConfig, syncFrequency };
    draft.updateConfig('syncFrequency', syncFrequency);
    props.settings.onSave(createReadwiseSetupPayload(draft, config, draft.draftSources));
  }
  return (
    <div className="space-y-6">
      <ReadwiseApiImportSection
        disabled={!props.settings.onPreviewSync || props.setup.isStartingSync || props.setup.isSyncPreviewing}
        frequency={props.setup.draft.draftConfig.syncFrequency}
        isRunning={props.setup.isStartingSync || props.setup.isSyncPreviewing}
        onChangeFrequency={saveFrequency}
        onPreview={() => void props.setup.handleApiSync()}
      />
      <ReadwiseBehaviorSection draft={props.setup.draft} />
    </div>
  );
}

function ReadwiseSelectedModeContent(props: {
  cleanup: ReturnType<typeof useReadwiseCleanup>;
  settings: SettingsReadwiseReaderContentProps;
  setup: ReturnType<typeof useReadwiseSetupController>;
  sourceMode: ReadwiseSourceMode;
}) {
  if (props.sourceMode === 'off') return null;
  if (props.sourceMode === 'api') {
    return <ReadwiseApiSettingsContent settings={props.settings} setup={props.setup} />;
  }
  return (
    <ReadwiseFolderSettingsSections
      canPreview={props.setup.canPreview}
      draft={props.setup.draft}
      integrationEnabled={props.setup.integrationEnabled}
      cleanupDisabled={props.cleanup.cleanupDisabled}
      onCleanup={() => void props.cleanup.openCleanupDialog()}
      onChangeIntegration={props.setup.handleChangeIntegration}
      onCheck={props.setup.handleCheck}
      onSync={() => void props.setup.handleRunSync()}
      syncStatus={props.setup.manualSyncStatus}
      syncDisabled={props.setup.syncDisabled}
      syncIsRunning={props.setup.syncIsRunning}
    />
  );
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
  return (
    <>
      <ReadwiseSourceModeSection
        committedMode={committedMode}
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
