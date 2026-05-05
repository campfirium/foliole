import { useEffect, useRef, useState } from 'react';

import { selectRuntimeImportDirectory } from '../../../../shared/platform/importBridge';
import { loadRuntimeLibraryPathSettings } from '../../../../shared/platform/libraryPathsBridge';
import { useRuntimeAvailability } from '../../../../shared/platform/runtimeAvailability';
import {
  areDatabaseBackupActionsAvailable,
  listDatabaseBackups,
  type DatabaseBackupEntry
} from '../../model/databaseBackups';
import {
  loadDatabaseBackupSettings,
  type DatabaseBackupSettings
} from '../../model/databaseBackupSettings';

import {
  persistBackupSettings,
  runCreateBackup,
  runRestoreBackup,
  updateDraftValue
} from './backupSettingsSectionStateUtils';

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

function useBackupStateStore() {
  const [settings, setSettings] = useState<DatabaseBackupSettings | null>(null);
  const [draft, setDraft] = useState<DatabaseBackupSettings | null>(null);
  const [backups, setBackups] = useState<DatabaseBackupEntry[]>([]);
  const [defaultBackupPath, setDefaultBackupPath] = useState('Library Home/Backups');
  const [isLoadingBackups, setIsLoadingBackups] = useState(true);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [restoringPath, setRestoringPath] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [pathErrorMessage, setPathErrorMessage] = useState('');

  return {
    backups,
    draft,
    defaultBackupPath,
    isCreatingBackup,
    isLoadingBackups,
    isSavingSettings,
    pathErrorMessage,
    restoringPath,
    setBackups,
    setDefaultBackupPath,
    setDraft,
    setIsCreatingBackup,
    setIsLoadingBackups,
    setIsSavingSettings,
    setPathErrorMessage,
    setRestoringPath,
    setSettings,
    setStatusMessage,
    settings,
    statusMessage
  };
}

function joinBackupPath(libraryHome: string) {
  const separator = libraryHome.includes('\\') ? '\\' : '/';
  return `${libraryHome.replace(/[\\/]+$/, '')}${separator}Backups`;
}

function useDefaultBackupPath(
  isDesktopRuntime: boolean,
  setDefaultBackupPath: (value: string) => void
) {
  useEffect(() => {
    let alive = true;
    if (!isDesktopRuntime) {
      return undefined;
    }
    void loadRuntimeLibraryPathSettings().then((paths) => {
      if (!alive || !paths) return;
      setDefaultBackupPath(joinBackupPath(paths.libraryHome));
    });
    return () => {
      alive = false;
    };
  }, [isDesktopRuntime, setDefaultBackupPath]);
}

function useBackupActionHandlers(args: {
  draft: DatabaseBackupSettings | null;
  refreshBackups: () => Promise<void>;
  saveRequestIdRef: { current: number };
  setDraft: (value: DatabaseBackupSettings) => void;
  setIsCreatingBackup: (value: boolean) => void;
  setIsSavingSettings: (value: boolean) => void;
  setPathErrorMessage: (value: string) => void;
  setRestoringPath: (value: string) => void;
  setSettings: (value: DatabaseBackupSettings) => void;
  setStatusMessage: (value: string) => void;
}) {
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
  const handleDraftField = (field: keyof DatabaseBackupSettings, value: string) => {
    if (!args.draft) return;
    saveDraft(updateDraftValue(args.draft, field, value));
  };
  const handleRestoreBackupPathDefault = () => {
    if (!args.draft) return;
    args.setPathErrorMessage('');
    saveDraft({ ...args.draft, backup_dir: '' }, true);
  };
  const handleChangeBackupPath = async () => {
    if (!args.draft) return;
    try {
      const nextPath = await selectRuntimeImportDirectory();
      if (!nextPath) return;
      args.setPathErrorMessage('');
      saveDraft({ ...args.draft, backup_dir: nextPath }, true);
    } catch {
      args.setPathErrorMessage('Could not choose a new backup folder.');
    }
  };
  return {
    handleChangeBackupPath,
    handleCreateBackup,
    handleDraftField,
    handleRestoreBackup,
    handleRestoreBackupPathDefault
  };
}

export function useBackupSettingsSectionState() {
  const isDesktopRuntime = useRuntimeAvailability(areDatabaseBackupActionsAvailable);
  const state = useBackupStateStore();
  const saveRequestIdRef = useRef(0);

  useInitialBackupData(
    isDesktopRuntime,
    state.setBackups,
    state.setDraft,
    state.setIsLoadingBackups,
    state.setSettings
  );
  useDefaultBackupPath(isDesktopRuntime, state.setDefaultBackupPath);

  const actions = useBackupActionHandlers({
    draft: state.draft,
    refreshBackups: () => listDatabaseBackups().then(state.setBackups),
    saveRequestIdRef,
    setDraft: state.setDraft,
    setIsCreatingBackup: state.setIsCreatingBackup,
    setIsSavingSettings: state.setIsSavingSettings,
    setPathErrorMessage: state.setPathErrorMessage,
    setRestoringPath: state.setRestoringPath,
    setSettings: state.setSettings,
    setStatusMessage: state.setStatusMessage
  });

  return {
    activeDraft: state.draft ?? state.settings,
    ...actions,
    backups: state.backups,
    defaultBackupPath: state.defaultBackupPath,
    isCreatingBackup: state.isCreatingBackup,
    isDesktopRuntime,
    isLoadingBackups: state.isLoadingBackups,
    isSavingSettings: state.isSavingSettings,
    pathErrorMessage: state.pathErrorMessage,
    restoringPath: state.restoringPath,
    statusMessage: state.statusMessage
  };
}
