export type NativeBackupRetentionTier = 'hourly' | 'daily' | 'weekly' | 'monthly';

export type NativeBackupSettingOverride =
  | NativeBackupRetentionTier
  | 'backup_dir'
  | 'extra_backup_dir'
  | 'extra_backup_max_count'
  | 'retention_priority'
  | 'safety_max_count'
  | 'total_size_limit_bytes';

export interface NativeBackupSettings {
  schema_version: 3;
  defaults_version: 1;
  daily_max_count: number;
  hourly_max_count: number;
  monthly_max_count: number;
  weekly_max_count: number;
  backup_dir: string;
  extra_backup_dir: string;
  extra_backup_max_count: number;
  retention_priority: NativeBackupRetentionTier[];
  safety_max_count: number;
  total_size_limit_bytes: number;
  overridden_fields: NativeBackupSettingOverride[];
  updated_at: string;
}

export interface NativeBackupCleanupStatus {
  failedCount: number;
  movedToTrashCount: number;
  remainingBytesOverLimit: number;
}

export interface NativeBackupRetentionStatus {
  counts: Record<NativeBackupRetentionTier, number>;
  lastCleanup: NativeBackupCleanupStatus | null;
  safetyCount: number;
  totalSizeBytes: number;
}
