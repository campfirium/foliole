import {
  SettingsErrorState,
  SettingsLoadingState,
  SettingsSection,
  SettingsStateAction
} from '../../../../shared/ui';

import {
  BackupListSection,
  BackupPathRow,
  BackupRulesSection,
  ExtraBackupCopySection
} from './backupSettingsSectionParts';
import { SourceDispositionStateRow } from './SourceDispositionStateRow';
import { useBackupSettingsSectionState } from './useBackupSettingsSectionState';

function BackupLoadingState() {
  return (
    <>
      <SettingsSection ariaLabel="Backup list loading section" title="Backups">
        <SettingsLoadingState />
      </SettingsSection>
      <SettingsSection ariaLabel="Source topic handling loading section" title="Source topic handling">
        <SettingsLoadingState />
      </SettingsSection>
      <SettingsSection ariaLabel="Backup location loading section" title="Backup location">
        <SettingsLoadingState />
      </SettingsSection>
      <SettingsSection ariaLabel="Extra backup copy loading section" title="Extra backup copy">
        <SettingsLoadingState />
      </SettingsSection>
      <SettingsSection ariaLabel="Backup rules loading section" title="Backup rules">
        <SettingsLoadingState />
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
      <SettingsSection ariaLabel="Source topic handling section" title="Source topic handling">
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
      <SettingsSection ariaLabel="Backup location section" title="Backup location">
        <BackupPathRow backupPath={state.activeDraft.backup_dir || state.defaultBackupPath} defaultBackupPath={state.activeDraft.backup_dir || state.defaultBackupPath} errorMessage={state.pathErrorMessage} isDesktopRuntime={state.isDesktopRuntime} onChangePath={state.handleChangeBackupPath} onRestoreDefault={state.handleRestoreBackupPathDefault} />
      </SettingsSection>
      <ExtraBackupCopySection draft={state.activeDraft} errorMessage={state.extraPathErrorMessage} isDesktopRuntime={state.isDesktopRuntime} onChangeField={state.handleDraftField} onChangePath={state.handleChangeExtraBackupPath} onRestoreDefault={state.handleRestoreExtraBackupPathDefault} />
      <BackupRulesSection draft={state.activeDraft} isDesktopRuntime={state.isDesktopRuntime} onChangeField={state.handleDraftField} />
    </>
  );
}
