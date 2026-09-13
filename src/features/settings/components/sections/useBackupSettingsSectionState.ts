import { useRef, useState } from 'react';

import { useRuntimeAvailability } from '../../../../shared/platform/runtimeAvailability';
import type { RuntimeSourceDispositionSummary } from '../../../../shared/platform/settingsRuntimeRepository';
import {
  areDatabaseBackupActionsAvailable,
  listDatabaseBackups,
  loadBackupRetentionStatus,
  type DatabaseBackupRetentionStatus,
  type DatabaseBackupEntry
} from '../../model/databaseBackups';
import type { DatabaseBackupSettings } from '../../model/databaseBackupSettings';

import { useDefaultBackupPath, useInitialBackupData } from './backupSettingsSectionLoadHooks';
import { useBackupActionHandlers } from './useBackupSettingsSectionActions';

const EMPTY_RETENTION_STATUS: DatabaseBackupRetentionStatus = {
  counts: { hourly: 0, daily: 0, weekly: 0, monthly: 0 },
  lastCleanup: null,
  safetyCount: 0,
  totalSizeBytes: 0
};

async function refreshBackupState(
  setBackups: (value: DatabaseBackupEntry[]) => void,
  setRetentionStatus: (value: DatabaseBackupRetentionStatus) => void
) {
  const [backups, retentionStatus] = await Promise.all([
    listDatabaseBackups(),
    loadBackupRetentionStatus()
  ]);
  setBackups(backups);
  setRetentionStatus(retentionStatus);
}

function useRetentionStatusState() {
  const [retentionStatus, setRetentionStatus] = useState(EMPTY_RETENTION_STATUS);
  return { retentionStatus, setRetentionStatus };
}

function useReloadState() {
  const [reloadKey, setReloadKey] = useState(0);
  return { reloadKey, retryInitialLoad: () => setReloadKey((value) => value + 1) };
}

function useBackupStateStore() {
  const [settings, setSettings] = useState<DatabaseBackupSettings | null>(null);
  const [draft, setDraft] = useState<DatabaseBackupSettings | null>(null);
  const [backups, setBackups] = useState<DatabaseBackupEntry[]>([]);
  const retention = useRetentionStatusState();
  const [defaultBackupPath, setDefaultBackupPath] = useState('Main folder/Backups');
  const [isLoadingBackups, setIsLoadingBackups] = useState(true);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isExportingSourceStates, setIsExportingSourceStates] = useState(false);
  const [isImportingSourceStates, setIsImportingSourceStates] = useState(false);
  const [isResettingSourceStates, setIsResettingSourceStates] = useState(false);
  const [restoringPath, setRestoringPath] = useState('');
  const [restoreSuccessFileName, setRestoreSuccessFileName] = useState('');
  const [sourceDispositionSummary, setSourceDispositionSummary] = useState<RuntimeSourceDispositionSummary>({ recordCount: 0, sizeBytes: 0 });
  const [sourceStateStatusMessage, setSourceStateStatusMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState('');
  const [extraPathErrorMessage, setExtraPathErrorMessage] = useState('');
  const [pathErrorMessage, setPathErrorMessage] = useState('');
  return {
    backups,
    ...retention,
    draft,
    defaultBackupPath,
    extraPathErrorMessage,
    isCreatingBackup,
    isExportingSourceStates,
    isImportingSourceStates,
    isLoadingBackups,
    isResettingSourceStates,
    isSavingSettings,
    loadErrorMessage,
    pathErrorMessage,
    restoringPath,
    restoreSuccessFileName,
    setBackups,
    setDefaultBackupPath,
    setDraft,
    setExtraPathErrorMessage,
    setIsCreatingBackup,
    setIsExportingSourceStates,
    setIsImportingSourceStates,
    setIsLoadingBackups,
    setIsResettingSourceStates,
    setIsSavingSettings,
    setLoadErrorMessage,
    setPathErrorMessage,
    setRestoringPath,
    setRestoreSuccessFileName,
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
  const reload = useReloadState();
  useInitialBackupData(
    isDesktopRuntime,
    reload.reloadKey,
    state.setBackups,
    state.setRetentionStatus,
    state.setSourceDispositionSummary,
    state.setDraft,
    state.setIsLoadingBackups,
    state.setLoadErrorMessage,
    state.setSettings
  );
  useDefaultBackupPath(isDesktopRuntime, state.setDefaultBackupPath);
  const actions = useBackupActionHandlers({
    draft: state.draft,
    refreshBackups: () => refreshBackupState(state.setBackups, state.setRetentionStatus),
    saveRequestIdRef,
    setDraft: state.setDraft,
    setExtraPathErrorMessage: state.setExtraPathErrorMessage,
    setIsCreatingBackup: state.setIsCreatingBackup,
    setIsExportingSourceStates: state.setIsExportingSourceStates,
    setIsImportingSourceStates: state.setIsImportingSourceStates,
    setIsSavingSettings: state.setIsSavingSettings,
    setPathErrorMessage: state.setPathErrorMessage,
    setRestoringPath: state.setRestoringPath,
    setRestoreSuccessFileName: state.setRestoreSuccessFileName,
    setSettings: state.setSettings,
    setSourceDispositionSummary: state.setSourceDispositionSummary,
    setIsResettingSourceStates: state.setIsResettingSourceStates,
    setSourceStateStatusMessage: state.setSourceStateStatusMessage,
    setStatusMessage: state.setStatusMessage
  });
  return {
    activeDraft: state.draft ?? state.settings,
    ...actions,
    backups: state.backups,
    retentionStatus: state.retentionStatus,
    defaultBackupPath: state.defaultBackupPath,
    extraPathErrorMessage: state.extraPathErrorMessage,
    isCreatingBackup: state.isCreatingBackup,
    isDesktopRuntime,
    isExportingSourceStates: state.isExportingSourceStates,
    isImportingSourceStates: state.isImportingSourceStates,
    isLoadingBackups: state.isLoadingBackups,
    isResettingSourceStates: state.isResettingSourceStates,
    loadErrorMessage: state.loadErrorMessage,
    pathErrorMessage: state.pathErrorMessage,
    retryInitialLoad: reload.retryInitialLoad,
    restoringPath: state.restoringPath,
    restoreSuccessFileName: state.restoreSuccessFileName,
    clearRestoreSuccess: () => state.setRestoreSuccessFileName(''),
    sourceDispositionSummary: state.sourceDispositionSummary,
    sourceStateStatusMessage: state.sourceStateStatusMessage,
    statusMessage: state.statusMessage
  };
}
