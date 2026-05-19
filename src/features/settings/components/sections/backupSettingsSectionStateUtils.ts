import type { RuntimeSourceDispositionSummary } from '../../../../shared/platform/settingsRuntimeRepository';
import {
  createDatabaseBackup,
  loadSourceDispositionSummary,
  reloadAfterDatabaseRestore,
  resetSourceDispositions,
  restoreDatabaseBackup,
  restoreSourceDispositions,
  type DatabaseBackupEntry
} from '../../model/databaseBackups';
import {
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

export function updateDraftValue(
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

export async function persistBackupSettings(args: {
  nextSettings: DatabaseBackupSettings;
  refreshBackups?: boolean;
  refreshBackupsList: () => Promise<void>;
  saveRequestIdRef: { current: number };
  setDraft: (value: DatabaseBackupSettings) => void;
  setIsSavingSettings: (value: boolean) => void;
  setSettings: (value: DatabaseBackupSettings) => void;
}) {
  args.setDraft(args.nextSettings);
  args.setSettings(args.nextSettings);
  args.setIsSavingSettings(true);
  const requestId = ++args.saveRequestIdRef.current;
  try {
    const savedSettings = await saveDatabaseBackupSettings(args.nextSettings);
    if (requestId !== args.saveRequestIdRef.current) return;
    args.setSettings(savedSettings);
    args.setDraft(savedSettings);
    if (args.refreshBackups) {
      await args.refreshBackupsList();
    }
  } finally {
    if (requestId === args.saveRequestIdRef.current) {
      args.setIsSavingSettings(false);
    }
  }
}

export async function runCreateBackup(
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

export async function runRestoreBackup(
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

export async function runRestoreSourceDispositions(args: {
  setIsRestoringSourceStates: (value: boolean) => void;
  setSourceDispositionSummary: (value: RuntimeSourceDispositionSummary) => void;
  setSourceStateStatusMessage: (value: string) => void;
}) {
  args.setIsRestoringSourceStates(true);
  const result = await restoreSourceDispositions();
  if (!result) {
    args.setSourceStateStatusMessage('Source state restore is available in the desktop app.');
  } else if (result.ok && 'dismissedCount' in result.value) {
    args.setSourceStateStatusMessage(`Restored ${result.value.dismissedCount} dismissed and ${result.value.trashedCount} deleted source states.`);
  } else if (!result.ok) {
    args.setSourceStateStatusMessage(result.errorMessage);
  }
  args.setSourceDispositionSummary(await loadSourceDispositionSummary());
  args.setIsRestoringSourceStates(false);
}

export async function runResetSourceDispositions(args: {
  setIsResettingSourceStates: (value: boolean) => void;
  setSourceDispositionSummary: (value: RuntimeSourceDispositionSummary) => void;
  setSourceStateStatusMessage: (value: string) => void;
}) {
  args.setIsResettingSourceStates(true);
  const result = await resetSourceDispositions();
  if (!result) {
    args.setSourceStateStatusMessage('Source state reset is available in the desktop app.');
  } else if (result.ok && 'recordCount' in result.value) {
    args.setSourceDispositionSummary(result.value);
    args.setSourceStateStatusMessage('Source states reset.');
  } else if (!result.ok) {
    args.setSourceStateStatusMessage(result.errorMessage);
    args.setSourceDispositionSummary(await loadSourceDispositionSummary());
  }
  args.setIsResettingSourceStates(false);
}
