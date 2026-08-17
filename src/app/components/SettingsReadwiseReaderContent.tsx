import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type {
  NativeReadwiseCleanupPreviewResult,
  NativeReadwiseCleanupRunResult,
  NativeReadwiseImportRunResult,
  NativeReadwiseSyncPreviewResult
} from '../../../lib/platform/nativeImportContract';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection
} from '../../shared/ui';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { ReadwiseCleanupDialog } from './ReadwiseCleanupDialog';
import { ReadwiseDeviceSelectionRow } from './ReadwiseDeviceSelectionRow';
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

interface ReadwiseSetupSectionProps {
  activeDeviceName: string | null;
  activeInstallationId: string | null;
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
  currentDeviceName: string | null;
  currentInstallationId: string | null;
  onTurnOff?: (() => void) | undefined;
  onUseThisDevice?: (() => void) | undefined;
}

function ReadwiseSetupSection(props: ReadwiseSetupSectionProps) {
  const t = useTranslation();

  return (
    <div className="space-y-6">
      <SettingsSection
        actions={<ReadwiseIntegrationSwitch
          disabled={false}
          enabled={props.integrationEnabled}
          onToggle={props.onChangeIntegration}
        />}
        ariaLabel={t('desktop.readwise.import.title')}
        description={t('desktop.readwise.import.description')}
        title={t('desktop.readwise.import.title')}
      >
        {props.currentInstallationId || props.activeInstallationId ? (
          <ReadwiseDeviceSelectionRow
            activeDeviceName={props.activeDeviceName}
            activeInstallationId={props.activeInstallationId}
            currentDeviceName={props.currentDeviceName}
            currentInstallationId={props.currentInstallationId}
            onTurnOff={props.onTurnOff}
            onUseThisDevice={props.onUseThisDevice}
          />
        ) : null}
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
  activeDeviceName?: string | null | undefined;
  activeInstallationId?: string | null | undefined;
  config: ReadwiseReaderConfig;
  currentDeviceName?: string | null | undefined;
  currentInstallationId?: string | null | undefined;
  onPreviewCleanup?: () => Promise<NativeReadwiseCleanupPreviewResult | null>;
  onPreviewSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseSyncPreviewResult | null>;
  onCancelSync?: () => Promise<unknown>;
  onRunCleanup?: () => Promise<NativeReadwiseCleanupRunResult | null>;
  onRunSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseImportRunResult | null>;
  onSave: (input: ReadwiseSetupPayload) => void;
  onTurnOff?: (() => void) | undefined;
  onUseThisDevice?: (() => void) | undefined;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}

function useCleanupController(
  props: SettingsReadwiseReaderContentProps,
  setup: ReturnType<typeof useReadwiseSetupController>
) {
  return useReadwiseCleanup({
    onCleanupComplete: () => props.onSave(createReadwiseSetupPayload(
      setup.draft,
      { ...setup.draft.draftConfig, enabled: false },
      disableReadwiseImportSource(setup.draft.draftSources)
    )),
    ...definedProps({
      onPreviewCleanup: props.onPreviewCleanup,
      onRunCleanup: props.onRunCleanup
    })
  });
}

export function SettingsReadwiseReaderContent(props: SettingsReadwiseReaderContentProps) {
  const setup = useReadwiseSetupController(props);
  const cleanup = useCleanupController(props, setup);
  const activeHere = Boolean(props.currentInstallationId) &&
    props.activeInstallationId === props.currentInstallationId;

  return (
    <>
      <ReadwiseSetupSection
        activeDeviceName={props.activeDeviceName ?? null}
        activeInstallationId={props.activeInstallationId ?? null}
        canChangeIntegration={setup.canChangeIntegration}
        canPreview={setup.canPreview}
        draft={setup.draft}
        integrationEnabled={setup.integrationEnabled}
        currentDeviceName={props.currentDeviceName ?? null}
        currentInstallationId={props.currentInstallationId ?? null}
        cleanupDisabled={cleanup.cleanupDisabled || !activeHere}
        onCleanup={() => void cleanup.openCleanupDialog()}
        onChangeIntegration={setup.handleChangeIntegration}
        onCheck={setup.handleCheck}
        onSync={() => void setup.handleRunSync()}
        onTurnOff={props.onTurnOff}
        onUseThisDevice={props.onUseThisDevice}
        syncStatus={setup.manualSyncStatus}
        syncDisabled={setup.syncDisabled || !activeHere}
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
