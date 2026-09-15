import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsErrorState,
  SettingsLoadingState,
  SettingsButton,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  SettingsStateAction
} from '../../../../shared/ui';
import { requestBackupSearchDialogOpen } from '../../model/backupSearchDialogRequests';

import { BackupRetentionRulesSection } from './BackupRetentionRulesSection';
import {
  BackupListSection,
  BackupPathRow,
  ExtraBackupCopySection
} from './backupSettingsSectionParts';
import { DatabaseCompactionRow } from './DatabaseCompactionRow';
import { SourceDispositionStateRow } from './SourceDispositionStateRow';
import { useBackupSettingsSectionState } from './useBackupSettingsSectionState';
import { useDatabaseCompaction } from './useDatabaseCompaction';

function BackupLoadingState() {
  const t = useTranslation();

  return (
    <>
      <SettingsSection ariaLabel={t('settings.backups.list.loadingAria')} title={t('settings.backups.title')}>
        <SettingsLoadingState />
      </SettingsSection>
      <SettingsSection ariaLabel={t('settings.backups.sourceHandling.loadingAria')} title={t('settings.backups.sourceHandling.title')}>
        <SettingsLoadingState />
      </SettingsSection>
      <SettingsSection ariaLabel={t('settings.backups.location.loadingAria')} title={t('settings.backups.location.title')}>
        <SettingsLoadingState />
      </SettingsSection>
      <SettingsSection ariaLabel={t('settings.backups.extra.loadingAria')} title={t('settings.backups.extra.title')}>
        <SettingsLoadingState />
      </SettingsSection>
      <SettingsSection ariaLabel={t('settings.backups.rules.loadingAria')} title={t('settings.backups.rules.title')}>
        <SettingsLoadingState />
      </SettingsSection>
    </>
  );
}

function BackupLoadErrorState(props: {
  errorMessage: string;
  onRetry: () => void;
}) {
  const t = useTranslation();

  return (
    <SettingsSection ariaLabel={t('settings.backups.error.sectionAria')} title={t('settings.backups.title')}>
      <SettingsErrorState
        action={<SettingsStateAction label={t('settings.backups.error.retry')} onClick={props.onRetry} />}
        description={props.errorMessage}
        title={t('settings.backups.error.unavailable')}
      />
    </SettingsSection>
  );
}

export function SettingsBackupsSection() {
  const state = useBackupSettingsSectionState();
  const compaction = useDatabaseCompaction(state.isDesktopRuntime);
  const t = useTranslation();

  if (!state.activeDraft) {
    if (state.loadErrorMessage) {
      return <BackupLoadErrorState errorMessage={state.loadErrorMessage} onRetry={state.retryInitialLoad} />;
    }
    return <BackupLoadingState />;
  }

  return (
    <>
      <BackupSearchSettings isDesktopRuntime={state.isDesktopRuntime} />
      <BackupListSection backups={state.backups} createBackup={state.handleCreateBackup} isBackupActionsAvailable={state.isDesktopRuntime} isCreatingBackup={state.isCreatingBackup} isLoadingBackups={state.isLoadingBackups} restoringPath={state.restoringPath} restoreBackup={state.handleRestoreBackup} statusMessage={state.statusMessage} />
      <SettingsSection ariaLabel={t('settings.backups.sourceHandling.sectionAria')} title={t('settings.backups.sourceHandling.title')}>
        <SourceDispositionStateRow
          isDesktopRuntime={state.isDesktopRuntime}
          isExporting={state.isExportingSourceStates}
          isImporting={state.isImportingSourceStates}
          isResetting={state.isResettingSourceStates}
          onExport={state.handleExportSourceDispositions}
          onImport={state.handleImportSourceDispositions}
          onReset={state.handleResetSourceDispositions}
          statusMessage={state.sourceStateStatusMessage}
          summary={state.sourceDispositionSummary}
        />
      </SettingsSection>
      <SettingsSection ariaLabel={t('settings.backups.location.sectionAria')} title={t('settings.backups.location.title')}>
        <BackupPathRow backupPath={state.activeDraft.backup_dir || state.defaultBackupPath} defaultBackupPath={state.activeDraft.backup_dir || state.defaultBackupPath} errorMessage={state.pathErrorMessage} isDesktopRuntime={state.isDesktopRuntime} onChangePath={state.handleChangeBackupPath} onRestoreDefault={state.handleRestoreBackupPathDefault} />
      </SettingsSection>
      <ExtraBackupCopySection draft={state.activeDraft} errorMessage={state.extraPathErrorMessage} isDesktopRuntime={state.isDesktopRuntime} onChangeField={state.handleDraftField} onChangePath={state.handleChangeExtraBackupPath} onRestoreDefault={state.handleRestoreExtraBackupPathDefault} />
      <BackupRetentionRulesSection
        draft={state.activeDraft}
        isDesktopRuntime={state.isDesktopRuntime}
        onChangeField={state.handleDraftField}
        onChangePriority={state.handleRetentionPriority}
        status={state.retentionStatus}
      />
      <SettingsSection ariaLabel={t('settings.backups.database.sectionAria')} title={t('settings.backups.database.sectionTitle')}>
        <DatabaseCompactionRow
          compact={compaction.compact}
          isAvailable={state.isDesktopRuntime}
          isCompacting={compaction.isCompacting}
          status={compaction.status}
          statusMessage={compaction.statusMessage === 'success'
            ? t('settings.backups.database.success')
            : compaction.statusMessage
              ? t('settings.backups.database.failed', { message: compaction.statusMessage })
              : ''}
        />
      </SettingsSection>
    </>
  );
}

function BackupSearchSettings(props: { isDesktopRuntime: boolean }) {
  const t = useTranslation();
  return (
    <SettingsSection ariaLabel={t('settings.backups.search.sectionAria')} title={t('settings.backups.search.sectionTitle')}>
      <SettingsRow description={t('settings.backups.search.description')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <SettingsButton className={SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME} disabled={!props.isDesktopRuntime} onClick={requestBackupSearchDialogOpen}>
            {t('settings.backups.search.action')}
          </SettingsButton>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
