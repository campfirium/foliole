import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type {
  NativeReadwiseCleanupPreviewResult,
  NativeReadwiseCleanupRunResult,
  NativeReadwiseImportRunResult,
  NativeReadwiseSyncPreviewResult
} from '../../../lib/platform/nativeContract';
import {
  AppButton,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection
} from '../../shared/ui';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { ReadwiseCleanupDialog } from './ReadwiseCleanupDialog';
import { ReadwiseReaderImportBehavior } from './ReadwiseReaderImportBehavior';
import {
  ReadwiseIntegrationSwitch,
  ReadwiseReaderSetupCheckPanel
} from './ReadwiseReaderSetupCheckPanel';
import { ReadwiseDirectorySection, ReadwiseParserFields } from './ReadwiseReaderSetupParts';
import { ReadwiseReaderSyncRow } from './ReadwiseReaderSyncControls';
import { ReadwiseSyncPreviewDialog } from './ReadwiseSyncPreviewDialog';
import { useReadwiseCleanup } from './useReadwiseCleanup';
import {
  useReadwiseSetupController,
  type ReadwiseSetupPayload
} from './useReadwiseSetupController';
import type { useReadwiseSetupDraft } from './useReadwiseSetupDraft';

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
  syncStatus: { message: string | null; tone: 'error' | 'normal' };
  cleanupDisabled: boolean;
  syncDisabled: boolean;
  syncIsRunning: boolean;
}) {
  return (
    <div className="space-y-6">
      <SettingsSection
        actions={<ReadwiseSetupActions {...props} />}
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
  return (
    <SettingsSection ariaLabel="Readwise Reader import behavior" title="Import behavior">
      <ReadwiseReaderImportBehavior config={draft.draftConfig} onChange={draft.updateConfig} />
    </SettingsSection>
  );
}

function ReadwiseImportSettingsSection({ draft }: { draft: ReadwiseSetupDraft }) {
  return (
    <SettingsSection ariaLabel="Readwise Reader import settings" title="Import settings">
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
  return (
    <SettingsRow
      description="Remove unchanged Readwise imports and keep changed topics in Foliole."
      title="Clean up imports"
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <AppButton disabled={props.disabled} onClick={props.onCleanup} size="sm" variant="primary">
          Clean up...
        </AppButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

interface SettingsReadwiseReaderContentProps {
  config: ReadwiseReaderConfig;
  onPreviewCleanup?: () => Promise<NativeReadwiseCleanupPreviewResult | null>;
  onPreviewSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseSyncPreviewResult | null>;
  onRunCleanup?: () => Promise<NativeReadwiseCleanupRunResult | null>;
  onRunSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseImportRunResult | null>;
  onSave: (input: ReadwiseSetupPayload) => void;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}

export function SettingsReadwiseReaderContent(props: SettingsReadwiseReaderContentProps) {
  const setup = useReadwiseSetupController(props);
  const cleanup = useReadwiseCleanup({
    onPreviewCleanup: props.onPreviewCleanup,
    onRunCleanup: props.onRunCleanup
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
        isPreviewing={setup.isSyncPreviewing}
        isStarting={setup.isStartingSync}
        notice={setup.syncNotice}
        onCancel={setup.closeSyncPreview}
        onStart={setup.startSync}
        open={setup.syncIntent !== null}
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
