import { useEffect, useState } from 'react';

import { selectRuntimeImportDirectory } from '../../../../shared/platform/importBridge';
import { useRuntimeAvailability } from '../../../../shared/platform/runtimeAvailability';
import {
  areDatabaseBackupActionsAvailable,
  createDatabaseBackup,
  listDatabaseBackups,
  reloadAfterDatabaseRestore,
  restoreDatabaseBackup,
  type DatabaseBackupEntry
} from '../../model/databaseBackups';
import {
  loadDatabaseBackupSettings,
  saveDatabaseBackupSettings,
  type DatabaseBackupSettings
} from '../../model/databaseBackupSettings';

import { getBackupFileName } from './backupSettingsSectionParts';

function parseInteger(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function parseGigabytes(value: string, fallbackBytes: number) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 1024 * 1024 * 1024) : fallbackBytes;
}

function useInitialBackupData(
  isDesktopRuntime: boolean,
  setBackups: (value: DatabaseBackupEntry[]) => void,
  setDraft: (value: DatabaseBackupSettings) => void,
  setIsLoadingBackups: (value: boolean) => void,
  setSettings: (value: DatabaseBackupSettings) => void
) {
  useEffect(() => {
    let alive = true;
    void loadDatabaseBackupSettings().then((value) => {
      if (!alive) return;
      setSettings(value);
      setDraft(value);
    });
    if (!isDesktopRuntime) {
      setBackups([]);
      setIsLoadingBackups(false);
    } else {
      void listDatabaseBackups().then((entries) => {
        if (!alive) return;
        setBackups(entries);
        setIsLoadingBackups(false);
      });
    }
    return () => {
      alive = false;
    };
  }, [isDesktopRuntime, setBackups, setDraft, setIsLoadingBackups, setSettings]);
}

async function runCreateBackup(
  refreshBackups: () => Promise<void>,
  setIsCreatingBackup: (value: boolean) => void,
  setStatusMessage: (value: string) => void
) {
  setStatusMessage('');
  setIsCreatingBackup(true);
  const result = await createDatabaseBackup();
  if (!result) {
    setStatusMessage('Backup creation failed: Desktop runtime unavailable.');
    setIsCreatingBackup(false);
    return;
  }
  if (!result.ok) {
    setStatusMessage(`Backup creation failed: ${result.errorMessage}`);
    setIsCreatingBackup(false);
    return;
  }
  await refreshBackups();
  setStatusMessage(`Backup created: ${getBackupFileName(result.value.destinationPath)}.`);
  setIsCreatingBackup(false);
}

async function runRestoreBackup(
  entry: DatabaseBackupEntry,
  setRestoringPath: (value: string) => void,
  setStatusMessage: (value: string) => void
) {
  setStatusMessage('');
  setRestoringPath(entry.filePath);
  const result = await restoreDatabaseBackup(entry.filePath);
  if (!result) {
    setStatusMessage('Backup restore failed: Desktop runtime unavailable.');
    setRestoringPath('');
    return;
  }
  if (!result.ok) {
    setStatusMessage(`Backup restore failed: ${result.errorMessage}`);
    setRestoringPath('');
    return;
  }
  setStatusMessage(`Backup restored from ${entry.fileName}. Reloading workspace…`);
  reloadAfterDatabaseRestore();
}

function updateDraftValue(
  currentDraft: DatabaseBackupSettings,
  field: keyof DatabaseBackupSettings,
  value: string
) {
  if (field === 'total_size_limit_bytes') {
    return { ...currentDraft, total_size_limit_bytes: parseGigabytes(value, currentDraft.total_size_limit_bytes) };
  }
  const fallback = currentDraft[field];
  return { ...currentDraft, [field]: parseInteger(value, typeof fallback === 'number' ? fallback : 0) };
}

function useBackupStateStore() {
  const [settings, setSettings] = useState<DatabaseBackupSettings | null>(null);
  const [draft, setDraft] = useState<DatabaseBackupSettings | null>(null);
  const [backups, setBackups] = useState<DatabaseBackupEntry[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(true);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [restoringPath, setRestoringPath] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [pathErrorMessage, setPathErrorMessage] = useState('');

  return {
    backups,
    draft,
    isCreatingBackup,
    isLoadingBackups,
    isSavingSettings,
    pathErrorMessage,
    restoringPath,
    saveMessage,
    setBackups,
    setDraft,
    setIsCreatingBackup,
    setIsLoadingBackups,
    setIsSavingSettings,
    setPathErrorMessage,
    setRestoringPath,
    setSaveMessage,
    setSettings,
    setStatusMessage,
    settings,
    statusMessage
  };
}

function useBackupActionHandlers(args: {
  draft: DatabaseBackupSettings | null;
  refreshBackups: () => Promise<void>;
  setDraft: (value: DatabaseBackupSettings) => void;
  setIsCreatingBackup: (value: boolean) => void;
  setIsSavingSettings: (value: boolean) => void;
  setPathErrorMessage: (value: string) => void;
  setRestoringPath: (value: string) => void;
  setSaveMessage: (value: string) => void;
  setSettings: (value: DatabaseBackupSettings) => void;
  setStatusMessage: (value: string) => void;
}) {
  const handleCreateBackup = () => void runCreateBackup(args.refreshBackups, args.setIsCreatingBackup, args.setStatusMessage);
  const handleRestoreBackup = (entry: DatabaseBackupEntry) =>
    void runRestoreBackup(entry, args.setRestoringPath, args.setStatusMessage);
  const handleDraftField = (field: keyof DatabaseBackupSettings, value: string) =>
    args.draft && args.setDraft(updateDraftValue(args.draft, field, value));
  const handleRestoreBackupPathDefault = () => {
    if (!args.draft) return;
    args.setDraft({ ...args.draft, backup_dir: '' });
    args.setPathErrorMessage('');
    args.setSaveMessage('Backup location reset to the default Backups folder. Save settings to apply it.');
  };
  const handleChangeBackupPath = async () => {
    if (!args.draft) return;
    try {
      const nextPath = await selectRuntimeImportDirectory();
      if (!nextPath) return;
      args.setDraft({ ...args.draft, backup_dir: nextPath });
      args.setPathErrorMessage('');
      args.setSaveMessage('Backup location updated. Save settings to apply it.');
    } catch {
      args.setPathErrorMessage('Could not choose a new backup folder.');
    }
  };
  const handleSaveSettings = async () => {
    if (!args.draft) return;
    args.setIsSavingSettings(true);
    const nextSettings = await saveDatabaseBackupSettings(args.draft);
    args.setSettings(nextSettings);
    args.setDraft(nextSettings);
    args.setSaveMessage('Backup settings saved.');
    await args.refreshBackups();
    args.setIsSavingSettings(false);
  };
  return {
    handleChangeBackupPath,
    handleCreateBackup,
    handleDraftField,
    handleRestoreBackup,
    handleRestoreBackupPathDefault,
    handleSaveSettings
  };
}

export function useBackupSettingsSectionState() {
  const isDesktopRuntime = useRuntimeAvailability(areDatabaseBackupActionsAvailable);
  const state = useBackupStateStore();

  useInitialBackupData(
    isDesktopRuntime,
    state.setBackups,
    state.setDraft,
    state.setIsLoadingBackups,
    state.setSettings
  );

  const actions = useBackupActionHandlers({
    draft: state.draft,
    refreshBackups: () => listDatabaseBackups().then(state.setBackups),
    setDraft: state.setDraft,
    setIsCreatingBackup: state.setIsCreatingBackup,
    setIsSavingSettings: state.setIsSavingSettings,
    setPathErrorMessage: state.setPathErrorMessage,
    setRestoringPath: state.setRestoringPath,
    setSaveMessage: state.setSaveMessage,
    setSettings: state.setSettings,
    setStatusMessage: state.setStatusMessage
  });

  return {
    activeDraft: state.draft ?? state.settings,
    ...actions,
    backups: state.backups,
    isCreatingBackup: state.isCreatingBackup,
    isDesktopRuntime,
    isLoadingBackups: state.isLoadingBackups,
    isSavingSettings: state.isSavingSettings,
    pathErrorMessage: state.pathErrorMessage,
    restoringPath: state.restoringPath,
    saveMessage: state.saveMessage,
    statusMessage: state.statusMessage
  };
}
