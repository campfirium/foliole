export type BackupRestoreSyncSource = 'backup' | 'current';
export type BackupRestoreSyncAction = 'local' | 'overwrite' | 'pause';

export interface BackupRestoreSyncSettings {
  group: { id: string; name: string } | null;
  enabled: boolean;
  paused: boolean;
}

export interface BackupRestoreSyncPreview {
  backup: BackupRestoreSyncSettings;
  current: BackupRestoreSyncSettings;
  same: boolean;
  revision: string;
}

export interface BackupRestoreSyncChoice {
  source: BackupRestoreSyncSource;
  action: BackupRestoreSyncAction;
  revision: string;
}

export function parseBackupRestoreSyncChoice(value: unknown): BackupRestoreSyncChoice {
  if (!value || typeof value !== 'object') throw new Error('backup_restore_sync_choice_required');
  const raw = value as Record<string, unknown>;
  if ((raw.source !== 'backup' && raw.source !== 'current') ||
      typeof raw.action !== 'string' || !['local', 'overwrite', 'pause'].includes(raw.action) ||
      typeof raw.revision !== 'string' || !/^[a-f0-9]{64}$/.test(raw.revision)) {
    throw new Error('backup_restore_sync_choice_invalid');
  }
  return raw as unknown as BackupRestoreSyncChoice;
}
