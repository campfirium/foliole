import type { ReadwiseSourceMode } from '../../../lib/core/import/importManagerSettings';
import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type {
  NativeReadwiseCleanupPreviewResult,
  NativeReadwiseCleanupRunResult,
  NativeReadwiseImportRunResult,
  NativeReadwiseSyncPreviewResult
} from '../../../lib/platform/nativeImportContract';
import type {
  NativeReadwiseReconcileCancelResult,
  NativeReadwiseReconcileResult
} from '../../../lib/platform/nativeReadwiseApiImportContract';
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
import { useReadwiseRemoteReconcile } from './useReadwiseRemoteReconcile';
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
  onRunReconcile?: () => Promise<NativeReadwiseReconcileResult | null>;
  onCancelReconcile?: () => Promise<NativeReadwiseReconcileCancelResult | null>;
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
  reconcile: ReturnType<typeof useReadwiseRemoteReconcile>;
  setup: ReturnType<typeof useReadwiseSetupController>;
  settings: SettingsReadwiseReaderContentProps;
}) {
  return (
    <div className="space-y-6">
      <ReadwiseApiImportSection
        disabled={!props.settings.onPreviewSync || props.setup.isStartingSync || props.setup.isSyncPreviewing}
        isRunning={props.setup.isStartingSync || props.setup.isSyncPreviewing}
        onPreview={() => void props.setup.handleApiSync()}
        onCancelReconcile={() => void props.reconcile.cancel()}
        onReconcile={() => void props.reconcile.run()}
        reconcileIsRunning={props.reconcile.isRunning}
        reconcileResult={props.reconcile.result}
      />
      <ReadwiseBehaviorSection draft={props.setup.draft} />
    </div>
  );
}

function ReadwiseLocalSettingsContent(props: SettingsReadwiseReaderContentProps) {
  const setup = useReadwiseSetupController(props);
  const sourceMode = props.readwiseSourceMode ?? 'folder';
  const cleanup = useReadwiseCleanup({
    onCleanupComplete: () => saveDisabledReadwiseSetup(props, setup.draft),
    ...definedProps({
      onPreviewCleanup: props.onPreviewCleanup,
      onRunCleanup: props.onRunCleanup
    })
  });
  const reconcile = useReadwiseRemoteReconcile({
    onCancel: props.onCancelReconcile,
    onRun: props.onRunReconcile
  });

  return (
    <>
      <ReadwiseSourceModeSection mode={sourceMode} onChange={props.onChangeSourceMode ?? (() => undefined)} />
      {sourceMode === 'folder' ? (
        <ReadwiseFolderSettingsSections
          canPreview={setup.canPreview}
          draft={setup.draft}
          integrationEnabled={setup.integrationEnabled}
          cleanupDisabled={cleanup.cleanupDisabled}
          onCleanup={() => void cleanup.openCleanupDialog()}
          onChangeIntegration={setup.handleChangeIntegration}
          onCheck={setup.handleCheck}
          onSync={() => void setup.handleRunSync()}
          syncStatus={setup.manualSyncStatus}
          syncDisabled={setup.syncDisabled}
          syncIsRunning={setup.syncIsRunning}
        />
      ) : (
        <ReadwiseApiSettingsContent reconcile={reconcile} settings={props} setup={setup} />
      )}
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
