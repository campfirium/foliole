import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SettingsErrorState,
  SettingsLoadingState,
  SettingsSection,
  SettingsStateAction
} from '../../../../shared/ui';

import { BackupRestoreSuccessDialog } from './BackupRestoreSuccessDialog';
import {
  BackupListSection,
  BackupPathRow,
  BackupRulesSection,
  ExtraBackupCopySection
} from './backupSettingsSectionParts';
import { SourceDispositionStateRow } from './SourceDispositionStateRow';
import { useBackupSettingsSectionState } from './useBackupSettingsSectionState';

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
  const t = useTranslation();

  if (!state.activeDraft) {
    if (state.loadErrorMessage) {
      return <BackupLoadErrorState errorMessage={state.loadErrorMessage} onRetry={state.retryInitialLoad} />;
    }
    return <BackupLoadingState />;
  }

  return (
    <>
      <BackupRestoreSuccessDialog
        fileName={state.restoreSuccessFileName}
        onClose={state.clearRestoreSuccess}
      />
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
      <BackupRulesSection draft={state.activeDraft} isDesktopRuntime={state.isDesktopRuntime} onChangeField={state.handleDraftField} />
    </>
  );
}
