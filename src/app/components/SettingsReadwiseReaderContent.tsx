import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type {
  NativeReadwiseCleanupPreviewResult,
  NativeReadwiseCleanupRunResult,
  NativeReadwiseImportRunResult,
  NativeReadwiseSyncPreviewResult
} from '../../../lib/platform/nativeImportContract';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useActiveSyncGroupMembership } from '../../shared/platform/external/useActiveSyncGroupMembership';
import {
  AppButton,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection
} from '../../shared/ui';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { ReadwiseCleanupDialog } from './ReadwiseCleanupDialog';
import { ReadwiseDeviceAssignmentRow, useReadwiseDeviceAssignment } from './ReadwiseDeviceAssignmentRow';
import { ReadwiseReaderImportBehavior } from './ReadwiseReaderImportBehavior';
import {
  ReadwiseIntegrationSwitch,
  ReadwiseReaderSetupCheckPanel
} from './ReadwiseReaderSetupCheckPanel';
import { ReadwiseDirectorySection, ReadwiseParserFields } from './ReadwiseReaderSetupParts';
import { ReadwiseReaderSyncRow } from './ReadwiseReaderSyncControls';
import { ReadwiseSyncPreviewDialog } from './ReadwiseSyncPreviewDialog';
import { useReadwiseCleanup } from './useReadwiseCleanup';
import type { ReadwiseManualSyncStatus } from './useReadwiseManualSync';
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

function ReadwiseSetupActions(props: {
  integrationEnabled: boolean;
  onChangeIntegration: () => void;
}) {
  return (
    <ReadwiseIntegrationSwitch
      disabled={false}
      enabled={props.integrationEnabled}
      onToggle={props.onChangeIntegration}
    />
  );
}

function ReadwiseSetupSection(props: {
  canChangeIntegration: boolean;
  canPreview: boolean;
  draft: ReadwiseSetupDraft;
  integrationEnabled: boolean;
  onChangeIntegration: () => void;
  onCheck: () => void;
  onSync: () => void;
  onCleanup: () => void;
  syncStatus: ReadwiseManualSyncStatus;
  cleanupDisabled: boolean;
  syncDisabled: boolean;
  syncIsRunning: boolean;
}) {
  const t = useTranslation();

  return (
    <div className="space-y-6">
      <SettingsSection
        actions={<ReadwiseSetupActions {...props} />}
        ariaLabel={t('desktop.readwise.import.title')}
        description={t('desktop.readwise.import.description')}
        title={t('desktop.readwise.import.title')}
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
          disabled={props.syncDisabled}
          isSyncing={props.syncIsRunning}
          onChange={props.draft.updateConfig}
          onSync={props.onSync}
          status={props.syncStatus}
        />
        <ReadwiseCleanupRow disabled={props.cleanupDisabled} onCleanup={props.onCleanup} />
      </SettingsSection>
      <ReadwiseBehaviorSection draft={props.draft} />
      <ReadwiseImportSettingsSection draft={props.draft} />
    </div>
  );
}

function ReadwiseBehaviorSection({ draft }: { draft: ReadwiseSetupDraft }) {
  const t = useTranslation();

  return (
    <SettingsSection ariaLabel={t('desktop.readwise.section.behavior.aria')} title={t('desktop.readwise.section.behavior.title')}>
      <ReadwiseReaderImportBehavior config={draft.draftConfig} onChange={draft.updateConfig} />
    </SettingsSection>
  );
}

function ReadwiseImportSettingsSection({ draft }: { draft: ReadwiseSetupDraft }) {
  const t = useTranslation();

  return (
    <SettingsSection ariaLabel={t('desktop.readwise.section.settings.aria')} title={t('desktop.readwise.section.settings.title')}>
      <ReadwiseDirectorySection
        onChooseFolder={draft.chooseFolder}
        onChooseRootFolder={draft.chooseRootFolder}
        readwiseRootPath={draft.draftRootPath}
        sources={draft.draftSources}
      />
      <ReadwiseParserFields config={draft.draftConfig} onChange={draft.updateConfig} />
    </SettingsSection>
  );
}

function ReadwiseCleanupRow(props: { disabled: boolean; onCleanup: () => void }) {
  const t = useTranslation();

  return (
    <SettingsRow
      description={t('desktop.readwise.cleanup.description')}
      title={t('desktop.readwise.cleanup.title')}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <AppButton disabled={props.disabled} onClick={props.onCleanup} size="sm" variant="danger">
          {t('desktop.readwise.cleanup.action')}
        </AppButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

interface SettingsReadwiseReaderContentProps {
  config: ReadwiseReaderConfig;
  onPreviewCleanup?: () => Promise<NativeReadwiseCleanupPreviewResult | null>;
  onPreviewSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseSyncPreviewResult | null>;
  onCancelSync?: () => Promise<unknown>;
  onRunCleanup?: () => Promise<NativeReadwiseCleanupRunResult | null>;
  onRunSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseImportRunResult | null>;
  onSave: (input: ReadwiseSetupPayload) => void;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}

function saveDisabledReadwiseSetup(props: SettingsReadwiseReaderContentProps, draft: ReadwiseSetupDraft) {
  props.onSave(createReadwiseSetupPayload(
    draft,
    { ...draft.draftConfig, enabled: false },
    disableReadwiseImportSource(draft.draftSources)
  ));
}

function ReadwiseLocalSettingsContent(props: SettingsReadwiseReaderContentProps) {
  const setup = useReadwiseSetupController(props);
  const cleanup = useReadwiseCleanup({
    onCleanupComplete: () => saveDisabledReadwiseSetup(props, setup.draft),
    ...definedProps({
      onPreviewCleanup: props.onPreviewCleanup,
      onRunCleanup: props.onRunCleanup
    })
  });

  return (
    <>
      <ReadwiseSetupSection
        canChangeIntegration={setup.canChangeIntegration}
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
  const device = useReadwiseDeviceAssignment();
  const hasActiveSyncGroup = useActiveSyncGroupMembership();
  if (hasActiveSyncGroup && device.assignment?.is_active === false) {
    return (
      <ReadwiseDeviceAssignmentRow
        assignment={device.assignment}
        onActivate={() => void device.activate()}
        readwiseRootPath={props.readwiseRootPath}
      />
    );
  }
  return <ReadwiseLocalSettingsContent {...props} />;
}
