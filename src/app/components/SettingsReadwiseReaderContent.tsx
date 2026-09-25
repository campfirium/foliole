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
import { useActiveSyncGroup } from '../../shared/platform/external/useActiveSyncGroup';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import type { ReadwiseApiModeSettings } from './ReadwiseApiModeSettingsRows';
import { ReadwiseFolderSettingsSections } from './ReadwiseFolderSettingsSections';
import { ReadwiseHostAssignmentRow, useReadwiseHostAssignment } from './ReadwiseHostAssignmentRow';
import { ReadwiseSourceModeSection } from './ReadwiseSourceModeSection';
import { ReadwiseSyncPreviewDialog } from './ReadwiseSyncPreviewDialog';
import {
  useReadwiseSetupController,
  type ReadwiseSetupPayload
} from './useReadwiseSetupController';
import { createReadwiseSetupPayload } from './useReadwiseSyncPreviewFlow';

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
    value: ReadwiseImportDestination | string
  ) => void;
  onCommitApiPolicy?: (policy: ReadwiseAutoImportPolicy) => Promise<void> | void;
  policy?: ReadwiseAutoImportPolicy;
  readwiseRootPath: string;
  readwiseSourceMode?: ReadwiseSourceMode;
  readwiseSourceModeConflict?: string[];
  readwiseApiMigrationCompleted?: boolean;
  readwiseSources: DraftImportSource[];
}

function ReadwiseSelectedModeContent(props: {
  settings: SettingsReadwiseReaderContentProps;
  setup: ReturnType<typeof useReadwiseSetupController>;
  sourceMode: ReadwiseSourceMode;
}) {
  if (props.sourceMode === 'off') return null;
  if (props.sourceMode === 'api') return null;
  return (
    <ReadwiseFolderSettingsSections
      canPreview={props.setup.canPreview}
      draft={props.setup.draft}
      integrationEnabled={props.setup.integrationEnabled}
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
  onChangeFrequency: (frequency: ReadwiseSyncFrequency) => void,
  syncAvailable: boolean
): ReadwiseApiModeSettings {
  return {
    config: setup.draft.draftConfig,
    onChangeFrequency,
    onSync: () => void setup.handleRunSync(),
    syncDisabled: !syncAvailable || setup.syncIsRunning,
    syncIsRunning: setup.syncIsRunning,
    syncStatus: setup.manualSyncStatus
  };
}

function ReadwiseLocalSettingsContent(props: SettingsReadwiseReaderContentProps) {
  const setup = useReadwiseSetupController(props);
  const committedMode = props.readwiseSourceMode ?? 'relay';
  const [sourceMode, setSourceMode] = useState(committedMode);
  useEffect(() => setSourceMode(committedMode), [committedMode]);
  function saveApiFrequency(syncFrequency: ReadwiseSyncFrequency) {
    const draft = setup.draft;
    const config = { ...draft.draftConfig, syncFrequency };
    draft.updateConfig('syncFrequency', syncFrequency);
    props.onSave(createReadwiseSetupPayload(draft, config, draft.draftSources));
  }
  const apiSettings = createApiModeSettings(setup, saveApiFrequency, Boolean(props.onRunSync));
  return (
    <>
      <ReadwiseSourceModeSection
        apiMigrationCompleted={props.readwiseApiMigrationCompleted ?? false}
        committedMode={committedMode}
        conflictReasons={props.readwiseSourceModeConflict ?? []}
        apiSettings={apiSettings}
        mode={sourceMode}
        onChange={setSourceMode}
        {...(props.onChangePolicy ? { onChangePolicy: props.onChangePolicy } : {})}
        {...(props.onCommitApiPolicy ? { onCommitApiPolicy: props.onCommitApiPolicy } : {})}
        policy={props.policy ?? createDefaultReadwiseAutoImportPolicy()}
        {...(props.onChangeSourceMode ? { onCommitMode: props.onChangeSourceMode } : {})}
      />
      <ReadwiseSelectedModeContent
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
    </>
  );
}

export function SettingsReadwiseReaderContent(props: SettingsReadwiseReaderContentProps) {
  const hostAssignment = useReadwiseHostAssignment();
  const hasActiveSyncGroup = useActiveSyncGroup();
  if (hasActiveSyncGroup && hostAssignment.assignment?.is_active === false &&
      (hostAssignment.assignment.active_host_name !== null ||
        hostAssignment.assignment.activation_blocked_reason === 'guard-history' ||
        (hostAssignment.assignment.legacy_unassigned &&
          hostAssignment.assignment.activation_blocked_reason !== 'connection-unavailable'))) {
    return (
      <>
        <ReadwiseHostAssignmentRow
          assignment={hostAssignment.assignment}
          error={hostAssignment.error}
          onActivate={() => void hostAssignment.activate()}
          pending={hostAssignment.pending}
        />
      </>
    );
  }
  return <ReadwiseLocalSettingsContent {...props} />;
}
