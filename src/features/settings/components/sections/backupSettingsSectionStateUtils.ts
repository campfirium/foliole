import type { RuntimeSourceDispositionSummary } from '../../../../shared/platform/settingsRuntimeRepository';
import {
  createDatabaseBackup,
  exportSourceDispositions,
  importSourceDispositions,
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
  const backupName = getBackupFileName(result.value.destinationPath);
  const extraStatus = result.value.extraBackup;
  if (extraStatus.status === 'failed') {
    setStatusMessage(`Backup created: ${backupName}. Extra copy failed: ${extraStatus.errorMessage}`);
    setIsCreatingBackup(false);
    return;
  }
  if (extraStatus.status === 'skipped_same_directory') {
    setStatusMessage(`Backup created: ${backupName}. Extra copy skipped because it uses the main backup location.`);
    setIsCreatingBackup(false);
    return;
  }
  if (extraStatus.status === 'copied') {
    setStatusMessage(`Backup created: ${backupName}. Extra copy created.`);
    setIsCreatingBackup(false);
    return;
  }
  setStatusMessage(`Backup created: ${backupName}.`);
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
    args.setSourceStateStatusMessage('Saved source topic handling is available in the desktop app.');
  } else if (result.ok && 'dismissedCount' in result.value) {
    const total = result.value.dismissedCount + result.value.trashedCount;
    args.setSourceStateStatusMessage(`Re-applied ${result.value.dismissedCount} dismissed and ${result.value.trashedCount} deleted source topic ${total === 1 ? 'state' : 'states'}.`);
  } else if (!result.ok) {
    args.setSourceStateStatusMessage(result.errorMessage);
  }
  args.setSourceDispositionSummary(await loadSourceDispositionSummary());
  args.setIsRestoringSourceStates(false);
}

export async function runExportSourceDispositions(args: {
  setIsExportingSourceStates: (value: boolean) => void;
  setSourceStateStatusMessage: (value: string) => void;
}) {
  args.setIsExportingSourceStates(true);
  const result = await exportSourceDispositions();
  if (!result) {
    args.setSourceStateStatusMessage('Saved source topic handling export is available in the desktop app.');
  } else if (result.ok && 'entryCount' in result.value) {
    if (result.value.status === 'saved') {
      args.setSourceStateStatusMessage(`Exported ${result.value.entryCount} saved source topic ${result.value.entryCount === 1 ? 'entry' : 'entries'}.`);
    } else if (result.value.status === 'save_failed') {
      args.setSourceStateStatusMessage('Could not export saved source topic handling.');
    }
  } else if (!result.ok) {
    args.setSourceStateStatusMessage(result.errorMessage);
  }
  args.setIsExportingSourceStates(false);
}

export async function runImportSourceDispositions(args: {
  setIsImportingSourceStates: (value: boolean) => void;
  setSourceDispositionSummary: (value: RuntimeSourceDispositionSummary) => void;
  setSourceStateStatusMessage: (value: string) => void;
}) {
  args.setIsImportingSourceStates(true);
  const result = await importSourceDispositions();
  if (!result) {
    args.setSourceStateStatusMessage('Saved source topic handling import is available in the desktop app.');
  } else if (result.ok && 'importedCount' in result.value) {
    if (result.value.status === 'imported') {
      args.setSourceDispositionSummary(result.value.summary);
      const appliedCount = result.value.appliedDismissedCount + result.value.appliedDeletedCount;
      args.setSourceStateStatusMessage(`Imported ${result.value.importedCount} saved source topic ${result.value.importedCount === 1 ? 'entry' : 'entries'} and applied ${appliedCount}.`);
    } else if (result.value.status === 'invalid_file') {
      args.setSourceStateStatusMessage('Could not import saved source topic handling from this file.');
    } else if (result.value.status === 'read_failed') {
      args.setSourceStateStatusMessage('Could not read the selected source topic handling file.');
    }
  } else if (!result.ok) {
    args.setSourceStateStatusMessage(result.errorMessage);
  }
  args.setIsImportingSourceStates(false);
}

export async function runResetSourceDispositions(args: {
  setIsResettingSourceStates: (value: boolean) => void;
  setSourceDispositionSummary: (value: RuntimeSourceDispositionSummary) => void;
  setSourceStateStatusMessage: (value: string) => void;
}) {
  args.setIsResettingSourceStates(true);
  const result = await resetSourceDispositions();
  if (!result) {
    args.setSourceStateStatusMessage('Saved source topic handling is available in the desktop app.');
  } else if (result.ok && 'recordCount' in result.value) {
    args.setSourceDispositionSummary(result.value);
    args.setSourceStateStatusMessage('Cleared saved source topic handling.');
  } else if (!result.ok) {
    args.setSourceStateStatusMessage(result.errorMessage);
    args.setSourceDispositionSummary(await loadSourceDispositionSummary());
  }
  args.setIsResettingSourceStates(false);
}
