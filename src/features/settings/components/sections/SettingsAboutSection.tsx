import { useEffect, useState } from 'react';

import { useRuntimeAvailability } from '../../../../shared/platform/runtimeAvailability';
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
  return `${updatedAt} · ${sizeInKilobytes}`;
}

function getBackupFileName(filePath: string) {
  const parts = filePath.split(/[/\\]/);
  return parts.at(-1) || filePath;
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
    <section aria-label="About settings section" className="settings-group">
      <h3 className="settings-group-title">Application</h3>
      <div className="settings-row settings-row-readonly">
        <div className="settings-row-copy">
          <h4>Foliole desktop</h4>
          <p>Reader-first outlining and review workflow built with Tauri + React.</p>
        </div>
        <span className="settings-pill">v0.1.0</span>
      </div>
    </section>
  );
}

function BackupHeaderRow(props: Pick<BackupSectionState, 'createBackup' | 'isBackupActionsAvailable' | 'isCreatingBackup' | 'restoringPath' | 'statusMessage'>) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <h4>Create backup</h4>
        <p>Save a SQLite snapshot into the managed backups folder.</p>
        {props.statusMessage ? <p className="settings-status-copy">{props.statusMessage}</p> : null}
      </div>
      <button
        className="settings-action-button"
        disabled={!props.isBackupActionsAvailable || props.isCreatingBackup || props.restoringPath.length > 0}
        onClick={props.createBackup}
        type="button"
      >
        {props.isCreatingBackup ? 'Creating…' : 'Create backup'}
      </button>
    </div>
  );
}

function BackupStateRows(props: Pick<BackupSectionState, 'backups' | 'isBackupActionsAvailable' | 'isCreatingBackup' | 'isLoadingBackups' | 'restoringPath' | 'restoreBackup'>) {
  if (!props.isBackupActionsAvailable) {
    return (
      <div className="settings-row settings-row-readonly">
        <div className="settings-row-copy">
          <h4>Desktop runtime required</h4>
          <p>Backup management is available in the desktop app.</p>
        </div>
      </div>
    );
  }

  if (props.isLoadingBackups) {
    return (
      <div className="settings-row settings-row-readonly">
        <div className="settings-row-copy">
          <h4>Loading backups</h4>
          <p>Scanning the managed backup folder.</p>
        </div>
      </div>
    );
  }

  if (props.backups.length === 0) {
    return (
      <div className="settings-row settings-row-readonly">
        <div className="settings-row-copy">
          <h4>No backups yet</h4>
          <p>Create a backup to keep a restorable SQLite snapshot.</p>
        </div>
      </div>
    );
  }

  return props.backups.map((entry) => (
    <div className="settings-row" key={entry.filePath}>
      <div className="settings-row-copy">
        <h4>{entry.fileName}</h4>
        <p>{formatBackupMeta(entry)}</p>
      </div>
      <button
        className="settings-action-button"
        disabled={props.isCreatingBackup || props.restoringPath.length > 0}
        onClick={() => props.restoreBackup(entry)}
        type="button"
      >
        {props.restoringPath === entry.filePath ? 'Restoring…' : 'Restore'}
      </button>
    </div>
  ));
}

function BackupSettingsSection(props: BackupSectionState) {
  return (
    <section aria-label="Backup settings section" className="settings-group">
      <h3 className="settings-group-title">Backups</h3>
      <BackupHeaderRow {...props} />
      <BackupStateRows {...props} />
    </section>
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
