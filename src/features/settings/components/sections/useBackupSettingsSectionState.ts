import { useRef, useState } from 'react';

import { useRuntimeAvailability } from '../../../../shared/platform/runtimeAvailability';
import type { RuntimeSourceDispositionSummary } from '../../../../shared/platform/settingsRuntimeRepository';
import {
  areDatabaseBackupActionsAvailable,
  listDatabaseBackups,
  type DatabaseBackupEntry
} from '../../model/databaseBackups';
import type { DatabaseBackupSettings } from '../../model/databaseBackupSettings';

import { useDefaultBackupPath, useInitialBackupData } from './backupSettingsSectionLoadHooks';
import { useBackupActionHandlers } from './useBackupSettingsSectionActions';

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
  const [extraPathErrorMessage, setExtraPathErrorMessage] = useState('');
  const [pathErrorMessage, setPathErrorMessage] = useState('');

  return {
    backups,
    draft,
    defaultBackupPath,
    extraPathErrorMessage,
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
    setExtraPathErrorMessage,
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
    setExtraPathErrorMessage: state.setExtraPathErrorMessage,
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
    extraPathErrorMessage: state.extraPathErrorMessage,
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
