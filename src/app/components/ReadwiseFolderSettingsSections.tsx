import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection
} from '../../shared/ui';

import { ReadwiseReaderImportBehavior } from './ReadwiseReaderImportBehavior';
import {
  ReadwiseIntegrationSwitch,
  ReadwiseReaderSetupCheckPanel
} from './ReadwiseReaderSetupCheckPanel';
import { ReadwiseDirectorySection, ReadwiseParserFields } from './ReadwiseReaderSetupParts';
import { ReadwiseReaderSyncRow } from './ReadwiseReaderSyncControls';
import type { ReadwiseManualSyncStatus } from './useReadwiseManualSync';
import type { useReadwiseSetupDraft } from './useReadwiseSetupDraft';

type ReadwiseSetupDraft = ReturnType<typeof useReadwiseSetupDraft>;

export function ReadwiseBehaviorSection({ draft }: { draft: ReadwiseSetupDraft }) {
  const t = useTranslation();
  return (
    <SettingsSection ariaLabel={t('desktop.readwise.section.behavior.aria')} title={t('desktop.readwise.section.behavior.title')}>
      <ReadwiseReaderImportBehavior config={draft.draftConfig} onChange={draft.updateConfig} />
    </SettingsSection>
  );
}

function ReadwiseCleanupRow(props: { disabled: boolean; onCleanup: () => void }) {
  const t = useTranslation();
  return (
    <SettingsRow description={t('desktop.readwise.cleanup.description')} title={t('desktop.readwise.cleanup.title')}>
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <AppButton disabled={props.disabled} onClick={props.onCleanup} size="sm" variant="danger">
          {t('desktop.readwise.cleanup.action')}
        </AppButton>
      </SettingsControlSlot>
    </SettingsRow>
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

export function ReadwiseFolderSettingsSections(props: {
  canPreview: boolean;
  cleanupDisabled: boolean;
  draft: ReadwiseSetupDraft;
  integrationEnabled: boolean;
  onChangeIntegration: () => void;
  onCheck: () => void;
  onCleanup: () => void;
  onSync: () => void;
  syncDisabled: boolean;
  syncIsRunning: boolean;
  syncStatus: ReadwiseManualSyncStatus;
}) {
  const t = useTranslation();
  const actions = (
    <ReadwiseIntegrationSwitch
      disabled={false}
      enabled={props.integrationEnabled}
      onToggle={props.onChangeIntegration}
    />
  );
  return (
    <div className="space-y-6">
      <SettingsSection
        actions={actions}
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
