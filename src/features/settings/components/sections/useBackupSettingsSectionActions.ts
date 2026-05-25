import { selectRuntimeFolder } from '../../../../shared/platform/folderSelectionRuntimeRepository';
import type { RuntimeSourceDispositionSummary } from '../../../../shared/platform/settingsRuntimeRepository';
import type { DatabaseBackupEntry } from '../../model/databaseBackups';
import type { DatabaseBackupSettings } from '../../model/databaseBackupSettings';

import {
  persistBackupSettings,
  runCreateBackup,
  runResetSourceDispositions,
  runRestoreBackup,
  runRestoreSourceDispositions,
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
  setIsResettingSourceStates: (value: boolean) => void;
  setIsRestoringSourceStates: (value: boolean) => void;
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

export function useBackupActionHandlers(args: BackupActionHandlerArgs) {
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
  const handleRestoreBackup = (entry: DatabaseBackupEntry) =>
    void runRestoreBackup(entry, args.setRestoringPath, args.setStatusMessage);
  const handleRestoreSourceDispositions = () => void runRestoreSourceDispositions(args);
  const handleResetSourceDispositions = () => void runResetSourceDispositions(args);
  const handleDraftField = (field: keyof DatabaseBackupSettings, value: string) => {
    if (!args.draft) return;
    saveDraft(updateDraftValue(args.draft, field, value));
  };
  return {
    ...buildPathHandlers(args, saveDraft),
    handleCreateBackup,
    handleDraftField,
    handleRestoreBackup,
    handleRestoreSourceDispositions,
    handleResetSourceDispositions,
  };
}
