import { SettingsRow, SettingsSection } from '../../../../shared/ui';

import {
  BackupListSection,
  BackupPathRow,
  BackupRulesSection
} from './backupSettingsSectionParts';
import { useBackupSettingsSectionState } from './useBackupSettingsSectionState';

function ApplicationInfo() {
  return (
    <SettingsSection ariaLabel="About settings section" title="Application">
      <SettingsRow description="Reader-first outlining and review workflow built with Electron + React." readonly title="Foliole desktop">
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.82rem] text-foreground/70">v0.1.0</span>
      </SettingsRow>
    </SettingsSection>
  );
}

function BackupLoadingState() {
  return (
    <SettingsSection ariaLabel="Backup settings section" title="Backups">
      <SettingsRow description="Loading backup settings." readonly title="Loading" />
    </SettingsSection>
  );
}

export function SettingsAboutSection() {
  const state = useBackupSettingsSectionState();
  if (!state.activeDraft) {
    return (
      <>
        <ApplicationInfo />
        <BackupLoadingState />
      </>
    );
  }

  return (
    <>
      <ApplicationInfo />
      <SettingsSection ariaLabel="Backup location section" title="Backup location">
        <BackupPathRow backupPath={state.activeDraft.backup_dir || 'Default: Library Home/Backups'} errorMessage={state.pathErrorMessage} isDesktopRuntime={state.isDesktopRuntime} isSaving={state.isSavingSettings} onChangePath={state.handleChangeBackupPath} onRestoreDefault={state.handleRestoreBackupPathDefault} />
      </SettingsSection>
      <BackupRulesSection draft={state.activeDraft} isDesktopRuntime={state.isDesktopRuntime} isSaving={state.isSavingSettings} onChangeField={state.handleDraftField} onSave={state.handleSaveSettings} saveMessage={state.saveMessage} />
      <BackupListSection backups={state.backups} createBackup={state.handleCreateBackup} isBackupActionsAvailable={state.isDesktopRuntime} isCreatingBackup={state.isCreatingBackup} isLoadingBackups={state.isLoadingBackups} restoringPath={state.restoringPath} restoreBackup={state.handleRestoreBackup} statusMessage={state.statusMessage} />
    </>
  );
}
