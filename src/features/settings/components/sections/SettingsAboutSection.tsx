import { useEffect, useState } from 'react';

import { useRuntimeAvailability } from '../../../../shared/platform/runtimeAvailability';
import { SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';
import {
  areDatabaseBackupActionsAvailable,
  createDatabaseBackup,
  listDatabaseBackups,
  reloadAfterDatabaseRestore,
  restoreDatabaseBackup,
  type DatabaseBackupEntry
} from '../../model/databaseBackups';

const BACKUP_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
});

const ACTION_BUTTON_CLASS_NAME =
  'inline-flex min-w-[112px] items-center justify-center rounded-md border border-border bg-background px-3 py-[7px] text-sm text-foreground disabled:cursor-default disabled:opacity-55';

interface BackupSectionState {
  backups: DatabaseBackupEntry[];
  isBackupActionsAvailable: boolean;
  isCreatingBackup: boolean;
  isLoadingBackups: boolean;
  restoringPath: string;
  statusMessage: string;
  createBackup: () => void;
  restoreBackup: (entry: DatabaseBackupEntry) => void;
}

function formatBackupMeta(entry: DatabaseBackupEntry) {
  const updatedAt = Number.isNaN(Date.parse(entry.updatedAt))
    ? entry.updatedAt
    : BACKUP_DATE_FORMATTER.format(new Date(entry.updatedAt));
  const sizeInKilobytes = `${Math.max(1, Math.round(entry.sizeBytes / 1024))} KB`;
  return `${describeBackupKind(entry)} · ${updatedAt} · ${sizeInKilobytes}`;
}

function getBackupFileName(filePath: string) {
  const parts = filePath.split(/[/\\]/);
  return parts.at(-1) || filePath;
}

function describeBackupKind(entry: DatabaseBackupEntry) {
  if (entry.kind === 'backup') {
    return 'Manual backup';
  }
  if (entry.snapshotReason === 'pre-restore') {
    return 'Auto safety snapshot before restore';
  }
  if (entry.snapshotReason === 'pre-migration') {
    return 'Auto safety snapshot before upgrade';
  }
  return 'Auto safety snapshot';
}

function loadInitialBackups(
  setBackups: (entries: DatabaseBackupEntry[]) => void,
  setIsLoadingBackups: (value: boolean) => void
) {
  let alive = true;
  void listDatabaseBackups()
    .then((entries) => {
      if (alive) {
        setBackups(entries);
      }
    })
    .finally(() => {
      if (alive) {
        setIsLoadingBackups(false);
      }
    });
  return () => {
    alive = false;
  };
}

async function runCreateBackup(
  refreshBackups: () => Promise<void>,
  setIsCreatingBackup: (value: boolean) => void,
  setStatusMessage: (value: string) => void
) {
  setStatusMessage('');
  setIsCreatingBackup(true);
  const result = await createDatabaseBackup();
  if (result && !result.ok) {
    setStatusMessage(`Backup creation failed: ${result.errorMessage}`);
    setIsCreatingBackup(false);
    return;
  }
  if (!result) {
    setStatusMessage('Backup creation failed: Desktop runtime unavailable.');
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
  if (result && !result.ok) {
    setStatusMessage(`Backup restore failed: ${result.errorMessage}`);
    setRestoringPath('');
    return;
  }
  if (!result) {
    setStatusMessage('Backup restore failed: Desktop runtime unavailable.');
    setRestoringPath('');
    return;
  }
  setStatusMessage(`Backup restored from ${entry.fileName}. Reloading workspace…`);
  reloadAfterDatabaseRestore();
}

function ApplicationInfo() {
  return (
    <SettingsSection ariaLabel="About settings section" title="Application">
      <SettingsRow description="Reader-first outlining and review workflow built with Tauri + React." readonly title="Foliole desktop">
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.82rem] text-foreground/70">v0.1.0</span>
      </SettingsRow>
    </SettingsSection>
  );
}

function BackupHeaderRow(props: Pick<BackupSectionState, 'createBackup' | 'isBackupActionsAvailable' | 'isCreatingBackup' | 'restoringPath' | 'statusMessage'>) {
  return (
    <SettingsRow
      description={
        <>
          Save a SQLite snapshot into the managed backups folder.
          Auto safety snapshots created before restore also appear below.
          {props.statusMessage ? <span className="mt-1 block text-emerald-700">{props.statusMessage}</span> : null}
        </>
      }
      title="Create backup"
    >
      <SettingsControlSlot className="justify-end max-[1080px]:justify-start">
        <button
          className={ACTION_BUTTON_CLASS_NAME}
          disabled={!props.isBackupActionsAvailable || props.isCreatingBackup || props.restoringPath.length > 0}
          onClick={props.createBackup}
          type="button"
        >
          {props.isCreatingBackup ? 'Creating…' : 'Create backup'}
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function BackupStateRows(props: Pick<BackupSectionState, 'backups' | 'isBackupActionsAvailable' | 'isCreatingBackup' | 'isLoadingBackups' | 'restoringPath' | 'restoreBackup'>) {
  if (!props.isBackupActionsAvailable) {
    return <SettingsRow description="Backup management is available in the desktop app." readonly title="Desktop runtime required" />;
  }

  if (props.isLoadingBackups) {
    return <SettingsRow description="Scanning backup and safety snapshot folders." readonly title="Loading backups" />;
  }

  if (props.backups.length === 0) {
    return <SettingsRow description="Create a backup to keep a restorable SQLite snapshot." readonly title="No backups yet" />;
  }

  return props.backups.map((entry) => (
    <SettingsRow description={formatBackupMeta(entry)} key={entry.filePath} title={entry.fileName}>
      <SettingsControlSlot className="justify-end max-[1080px]:justify-start">
        <button
          className={ACTION_BUTTON_CLASS_NAME}
          disabled={props.isCreatingBackup || props.restoringPath.length > 0}
          onClick={() => props.restoreBackup(entry)}
          type="button"
        >
          {props.restoringPath === entry.filePath ? 'Restoring…' : 'Restore'}
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  ));
}

function BackupSettingsSection(props: BackupSectionState) {
  return (
    <SettingsSection ariaLabel="Backup settings section" title="Backups">
      <BackupHeaderRow {...props} />
      <BackupStateRows {...props} />
    </SettingsSection>
  );
}

function useBackupSectionState(): BackupSectionState {
  const [backups, setBackups] = useState<DatabaseBackupEntry[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(true);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [restoringPath, setRestoringPath] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const isBackupActionsAvailable = useRuntimeAvailability(areDatabaseBackupActionsAvailable);

  useEffect(() => {
    if (!isBackupActionsAvailable) {
      setBackups([]);
      setIsLoadingBackups(false);
      return;
    }
    setIsLoadingBackups(true);
    return loadInitialBackups(setBackups, setIsLoadingBackups);
  }, [isBackupActionsAvailable]);

  const refreshBackups = () => listDatabaseBackups().then(setBackups);
  const createBackup = () => void runCreateBackup(refreshBackups, setIsCreatingBackup, setStatusMessage);
  const restoreBackup = (entry: DatabaseBackupEntry) =>
    void runRestoreBackup(entry, setRestoringPath, setStatusMessage);

  return {
    backups,
    isBackupActionsAvailable,
    isCreatingBackup,
    isLoadingBackups,
    restoringPath,
    statusMessage,
    createBackup,
    restoreBackup
  };
}

export function SettingsAboutSection() {
  const state = useBackupSectionState();
  return (
    <>
      <ApplicationInfo />
      <BackupSettingsSection {...state} />
    </>
  );
}
