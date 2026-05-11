import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type {
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
import { ReadwiseReaderImportBehavior } from './ReadwiseReaderImportBehavior';
import {
  ReadwiseIntegrationSwitch,
  ReadwiseReaderSetupCheckPanel
} from './ReadwiseReaderSetupCheckPanel';
import { ReadwiseDirectorySection, ReadwiseParserFields } from './ReadwiseReaderSetupParts';
import { ReadwiseReaderSyncRow } from './ReadwiseReaderSyncControls';
import { ReadwiseSyncPreviewDialog } from './ReadwiseSyncPreviewDialog';
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
  syncStatus: { message: string | null; tone: 'error' | 'normal' };
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
        <ReadwiseCleanupRow />
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
  onPreviewSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseSyncPreviewResult | null>;
  onRunSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseImportRunResult | null>;
  onSave: (input: ReadwiseSetupPayload) => void;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}

export function SettingsReadwiseReaderContent(props: SettingsReadwiseReaderContentProps) {
  const setup = useReadwiseSetupController(props);

  return (
    <>
      <ReadwiseSetupSection
        canChangeIntegration={setup.canChangeIntegration}
        canPreview={setup.canPreview}
        draft={setup.draft}
        integrationEnabled={setup.integrationEnabled}
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
    </>
  );
}
