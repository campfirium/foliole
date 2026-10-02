import { useTranslation, type Translate } from '../../../../shared/localization/LocalizationProvider';
import { selectRuntimeFolder } from '../../../../shared/platform/folderSelectionRuntimeRepository';
import type { RuntimeSourceDispositionSummary } from '../../../../shared/platform/settingsRuntimeRepository';
import { requestAppConfirmation } from '../../../../shared/ui/appConfirmation';
import {
  beginWorkspaceRestoreSession,
  cancelWorkspaceRestoreSession,
  completeWorkspaceRestoreSession
} from '../../../../store/workspaceRestoreSession';
import { chooseBackupRestoreSync } from '../../model/backupRestoreSyncChoice';
import type { DatabaseBackupEntry } from '../../model/databaseBackups';
import type { DatabaseBackupSettings } from '../../model/databaseBackupSettings';
import { readDatabaseRestoreFailureMessage } from '../../model/databaseRestoreFailureMessage';
import { localizeDatabaseRestoreFailure } from '../../model/databaseRestoreNotice';

import {
  persistBackupSettings,
  runCreateBackup,
  runExportSourceDispositions,
  runImportSourceDispositions,
  runResetSourceDispositions,
  runRestoreBackup,
  updateDraftValue
} from './backupSettingsSectionStateUtils';

type SaveBackupSettingsDraft = (nextSettings: DatabaseBackupSettings, refreshBackups?: boolean) => void;

interface BackupActionHandlerArgs {
  draft: DatabaseBackupSettings | null;
  refreshBackups: () => Promise<void>;
  saveRequestIdRef: { current: number };
  setDraft: (value: DatabaseBackupSettings) => void;
  setIsCreatingBackup: (value: boolean) => void;
  setIsSavingSettings: (value: boolean) => void;
  setExtraPathErrorMessage: (value: string) => void;
  setPathErrorMessage: (value: string) => void;
  setRestoringPath: (value: string) => void;
  setSettings: (value: DatabaseBackupSettings) => void;
  setSourceDispositionSummary: (value: RuntimeSourceDispositionSummary) => void;
  setIsExportingSourceStates: (value: boolean) => void;
  setIsImportingSourceStates: (value: boolean) => void;
  setIsResettingSourceStates: (value: boolean) => void;
  setSourceStateStatusMessage: (value: string) => void;
  setStatusMessage: (value: string) => void;
}

async function updateBackupPath(args: {
  draft: DatabaseBackupSettings;
  field?: 'backup_dir' | 'extra_backup_dir';
  saveDraft: SaveBackupSettingsDraft;
  setPathErrorMessage: (value: string) => void;
}) {
  try {
    const nextPath = await selectRuntimeFolder();
    if (!nextPath) return;
    args.setPathErrorMessage('');
    args.saveDraft({ ...args.draft, [args.field ?? 'backup_dir']: nextPath }, true);
  } catch {
    args.setPathErrorMessage('Could not choose a backup folder.');
  }
}

function restoreBackupPathDefault(args: {
  draft: DatabaseBackupSettings | null;
  saveDraft: SaveBackupSettingsDraft;
  setPathErrorMessage: (value: string) => void;
}) {
  if (!args.draft) return;
  args.setPathErrorMessage('');
  args.saveDraft({ ...args.draft, backup_dir: '' }, true);
}

function restoreExtraBackupPathDefault(args: {
  draft: DatabaseBackupSettings | null;
  saveDraft: SaveBackupSettingsDraft;
  setExtraPathErrorMessage: (value: string) => void;
}) {
  if (!args.draft) return;
  args.setExtraPathErrorMessage('');
  args.saveDraft({ ...args.draft, extra_backup_dir: '' }, false);
}

async function changeExtraBackupPath(args: {
  draft: DatabaseBackupSettings | null;
  saveDraft: SaveBackupSettingsDraft;
  setExtraPathErrorMessage: (value: string) => void;
}) {
  if (!args.draft) return;
  await updateBackupPath({
    draft: args.draft,
    field: 'extra_backup_dir',
    saveDraft: args.saveDraft,
    setPathErrorMessage: args.setExtraPathErrorMessage
  });
}

function buildPathHandlers(args: BackupActionHandlerArgs, saveDraft: SaveBackupSettingsDraft) {
  const handleRestoreBackupPathDefault = () => {
    restoreBackupPathDefault({ draft: args.draft, saveDraft, setPathErrorMessage: args.setPathErrorMessage });
  };
  const handleRestoreExtraBackupPathDefault = () => {
    restoreExtraBackupPathDefault({
      draft: args.draft,
      saveDraft,
      setExtraPathErrorMessage: args.setExtraPathErrorMessage
    });
  };
  const handleChangeBackupPath = async () => {
    if (!args.draft) return;
    await updateBackupPath({ draft: args.draft, saveDraft, setPathErrorMessage: args.setPathErrorMessage });
  };
  const handleChangeExtraBackupPath = async () => {
    await changeExtraBackupPath({
      draft: args.draft,
      saveDraft,
      setExtraPathErrorMessage: args.setExtraPathErrorMessage
    });
  };
  return {
    handleChangeBackupPath,
    handleChangeExtraBackupPath,
    handleRestoreBackupPathDefault,
    handleRestoreExtraBackupPathDefault
  };
}

function reportRestoreFailure(message: string, args: BackupActionHandlerArgs, t: Translate) {
  args.setStatusMessage(message);
  void requestAppConfirmation({
    cancelLabel: null,
    confirmLabel: t('settings.backups.restore.success.done'),
    description: message,
    title: message === t('settings.backups.restore.reloadFailed')
      ? t('settings.backups.restore.success.title') : t('settings.backups.restore.failure.title')
  });
}

async function restoreWorkspaceBackup(entry: DatabaseBackupEntry, args: BackupActionHandlerArgs, t: Translate) {
  let choice;
  try { choice = await chooseBackupRestoreSync(entry.filePath, t); }
  catch (error) {
    const reason = (error instanceof Error ? error.message : String(error))
      .replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, '');
    const message = readDatabaseRestoreFailureMessage(
      `The selected backup was not restored. Your current library is unchanged.\nReason: ${reason}`
    );
    reportRestoreFailure(localizeDatabaseRestoreFailure(message, t), args, t);
    await args.refreshBackups().catch((refreshError) => {
      console.error('[backup] could not refresh after restore inspection failed', refreshError);
    });
    return;
  }
  if (!choice) return;
  if (!await beginWorkspaceRestoreSession()) {
    reportRestoreFailure(t('settings.backups.restore.failure.pendingChanges'), args, t);
    return;
  }
  await runRestoreBackup(entry, args.setRestoringPath, (message) => {
    if (message) reportRestoreFailure(localizeDatabaseRestoreFailure(message, t), args, t);
    else args.setStatusMessage('');
  }, async (fileName) => {
    completeWorkspaceRestoreSession(fileName);
  }, cancelWorkspaceRestoreSession, choice);
}

export function useBackupActionHandlers(args: BackupActionHandlerArgs) {
  const t = useTranslation();
  const saveDraft = (nextSettings: DatabaseBackupSettings, refreshBackups = false) =>
    void persistBackupSettings({
      nextSettings,
      refreshBackups,
      refreshBackupsList: args.refreshBackups,
      saveRequestIdRef: args.saveRequestIdRef,
      setDraft: args.setDraft,
      setIsSavingSettings: args.setIsSavingSettings,
      setSettings: args.setSettings
    });

  const handleCreateBackup = () => void runCreateBackup(args.refreshBackups, args.setIsCreatingBackup, args.setStatusMessage);
  const handleRestoreBackup = (entry: DatabaseBackupEntry) => void restoreWorkspaceBackup(entry, args, t);
  const handleExportSourceDispositions = () => void runExportSourceDispositions(args);
  const handleImportSourceDispositions = () => void runImportSourceDispositions(args);
  const handleResetSourceDispositions = () => void runResetSourceDispositions(args);
  const handleDraftField = (field: keyof DatabaseBackupSettings, value: string) => {
    if (!args.draft) return;
    const refreshRetention = field.endsWith('_max_count') || field === 'total_size_limit_bytes';
    saveDraft(updateDraftValue(args.draft, field, value), refreshRetention);
  };
  const handleRetentionPriority = (retentionPriority: DatabaseBackupSettings['retention_priority']) => {
    if (!args.draft) return;
    saveDraft({ ...args.draft, retention_priority: retentionPriority }, true);
  };
  return {
    ...buildPathHandlers(args, saveDraft),
    handleCreateBackup,
    handleDraftField,
    handleRetentionPriority,
    handleRestoreBackup,
    handleExportSourceDispositions,
    handleImportSourceDispositions,
    handleResetSourceDispositions,
  };
}
