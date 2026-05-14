import {
  SettingsErrorState,
  SettingsLoadingState,
  SettingsSection,
  SettingsStateAction
} from '../../../../shared/ui';

import {
  BackupListSection,
  BackupPathRow,
  BackupRulesSection
} from './backupSettingsSectionParts';
import { useBackupSettingsSectionState } from './useBackupSettingsSectionState';

function BackupLoadingState() {
  return (
    <>
      <SettingsSection ariaLabel="Backup list loading section" title="Backups">
        <SettingsLoadingState description="Loading backup settings." title="Loading" />
      </SettingsSection>
      <SettingsSection ariaLabel="Backup rules loading section" title="Backup rules">
        <SettingsLoadingState description="Loading backup settings." title="Loading" />
      </SettingsSection>
      <SettingsSection ariaLabel="Backup location loading section" title="Backup location">
        <SettingsLoadingState description="Loading backup settings." title="Loading" />
      </SettingsSection>
    </>
  );
}

function BackupLoadErrorState(props: {
  errorMessage: string;
  onRetry: () => void;
}) {
  return (
    <SettingsSection ariaLabel="Backup settings error section" title="Backups">
      <SettingsErrorState
        action={<SettingsStateAction label="Retry" onClick={props.onRetry} />}
        description={props.errorMessage}
        title="Backup settings unavailable"
      />
    </SettingsSection>
  );
}

export function SettingsBackupsSection() {
  const state = useBackupSettingsSectionState();
  if (!state.activeDraft) {
    if (state.loadErrorMessage) {
      return <BackupLoadErrorState errorMessage={state.loadErrorMessage} onRetry={state.retryInitialLoad} />;
    }
    return <BackupLoadingState />;
  }

  return (
    <>
      <BackupListSection backups={state.backups} createBackup={state.handleCreateBackup} isBackupActionsAvailable={state.isDesktopRuntime} isCreatingBackup={state.isCreatingBackup} isLoadingBackups={state.isLoadingBackups} restoringPath={state.restoringPath} restoreBackup={state.handleRestoreBackup} statusMessage={state.statusMessage} />
      <BackupRulesSection draft={state.activeDraft} isDesktopRuntime={state.isDesktopRuntime} onChangeField={state.handleDraftField} />
      <SettingsSection ariaLabel="Backup location section" title="Backup location">
        <BackupPathRow backupPath={state.activeDraft.backup_dir || state.defaultBackupPath} defaultBackupPath={state.activeDraft.backup_dir || state.defaultBackupPath} errorMessage={state.pathErrorMessage} isDesktopRuntime={state.isDesktopRuntime} onChangePath={state.handleChangeBackupPath} onRestoreDefault={state.handleRestoreBackupPathDefault} />
      </SettingsSection>
    </>
  );
}
