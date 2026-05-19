import { useRef, useState } from 'react';

import { selectRuntimeFolder } from '../../../../shared/platform/folderSelectionRuntimeRepository';
import { useRuntimeAvailability } from '../../../../shared/platform/runtimeAvailability';
import type { RuntimeSourceDispositionSummary } from '../../../../shared/platform/settingsRuntimeRepository';
import {
  areDatabaseBackupActionsAvailable,
  listDatabaseBackups,
  type DatabaseBackupEntry
} from '../../model/databaseBackups';
import type { DatabaseBackupSettings } from '../../model/databaseBackupSettings';

import { useDefaultBackupPath, useInitialBackupData } from './backupSettingsSectionLoadHooks';
import {
  persistBackupSettings,
  runCreateBackup,
  runResetSourceDispositions,
  runRestoreBackup,
  runRestoreSourceDispositions,
  updateDraftValue
} from './backupSettingsSectionStateUtils';

function useBackupStateStore() {
  const [settings, setSettings] = useState<DatabaseBackupSettings | null>(null);
  const [draft, setDraft] = useState<DatabaseBackupSettings | null>(null);
  const [backups, setBackups] = useState<DatabaseBackupEntry[]>([]);
  const [defaultBackupPath, setDefaultBackupPath] = useState('Library Home/Backups');
  const [isLoadingBackups, setIsLoadingBackups] = useState(true);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isResettingSourceStates, setIsResettingSourceStates] = useState(false);
  const [isRestoringSourceStates, setIsRestoringSourceStates] = useState(false);
  const [restoringPath, setRestoringPath] = useState('');
  const [sourceDispositionSummary, setSourceDispositionSummary] = useState<RuntimeSourceDispositionSummary>({ recordCount: 0, sizeBytes: 0 });
  const [sourceStateStatusMessage, setSourceStateStatusMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState('');
  const [pathErrorMessage, setPathErrorMessage] = useState('');

  return {
    backups,
    draft,
    defaultBackupPath,
    isCreatingBackup,
    isLoadingBackups,
    isResettingSourceStates,
    isRestoringSourceStates,
    isSavingSettings,
    loadErrorMessage,
    pathErrorMessage,
    restoringPath,
    setBackups,
    setDefaultBackupPath,
    setDraft,
    setIsCreatingBackup,
    setIsLoadingBackups,
    setIsResettingSourceStates,
    setIsRestoringSourceStates,
    setIsSavingSettings,
    setLoadErrorMessage,
    setPathErrorMessage,
    setRestoringPath,
    setSettings,
    setSourceDispositionSummary,
    setSourceStateStatusMessage,
    setStatusMessage,
    settings,
    sourceDispositionSummary,
    sourceStateStatusMessage,
    statusMessage
  };
}

async function updateBackupPath(args: {
  draft: DatabaseBackupSettings;
  saveDraft: (nextSettings: DatabaseBackupSettings, refreshBackups?: boolean) => void;
  setPathErrorMessage: (value: string) => void;
}) {
  try {
    const nextPath = await selectRuntimeFolder();
    if (!nextPath) return;
    args.setPathErrorMessage('');
    args.saveDraft({ ...args.draft, backup_dir: nextPath }, true);
  } catch {
    args.setPathErrorMessage('Could not choose a new backup folder.');
  }
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
  setSourceDispositionSummary: (value: RuntimeSourceDispositionSummary) => void;
  setIsResettingSourceStates: (value: boolean) => void;
  setIsRestoringSourceStates: (value: boolean) => void;
  setSourceStateStatusMessage: (value: string) => void;
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
  const handleRestoreSourceDispositions = () => void runRestoreSourceDispositions(args);
  const handleResetSourceDispositions = () => void runResetSourceDispositions(args);
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
    await updateBackupPath({ draft: args.draft, saveDraft, setPathErrorMessage: args.setPathErrorMessage });
  };
  return {
    handleChangeBackupPath,
    handleCreateBackup,
    handleDraftField,
    handleRestoreBackup,
    handleRestoreSourceDispositions,
    handleResetSourceDispositions,
    handleRestoreBackupPathDefault
  };
}

export function useBackupSettingsSectionState() {
  const isDesktopRuntime = useRuntimeAvailability(areDatabaseBackupActionsAvailable);
  const state = useBackupStateStore();
  const saveRequestIdRef = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);

  useInitialBackupData(
    isDesktopRuntime,
    reloadKey,
    state.setBackups,
    state.setSourceDispositionSummary,
    state.setDraft,
    state.setIsLoadingBackups,
    state.setLoadErrorMessage,
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
    setSourceDispositionSummary: state.setSourceDispositionSummary,
    setIsResettingSourceStates: state.setIsResettingSourceStates,
    setIsRestoringSourceStates: state.setIsRestoringSourceStates,
    setSourceStateStatusMessage: state.setSourceStateStatusMessage,
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
    isResettingSourceStates: state.isResettingSourceStates,
    isRestoringSourceStates: state.isRestoringSourceStates,
    isSavingSettings: state.isSavingSettings,
    loadErrorMessage: state.loadErrorMessage,
    pathErrorMessage: state.pathErrorMessage,
    retryInitialLoad: () => setReloadKey((value) => value + 1),
    restoringPath: state.restoringPath,
    sourceDispositionSummary: state.sourceDispositionSummary,
    sourceStateStatusMessage: state.sourceStateStatusMessage,
    statusMessage: state.statusMessage
  };
}
