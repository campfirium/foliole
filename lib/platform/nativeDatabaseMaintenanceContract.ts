export type NativeDatabaseMaintenanceKey = 'main-data' | 'search-data' | 'external-sources-data';

export type NativeDatabaseMaintenanceState = 'present' | 'absent' | 'unreadable';

export type NativeDatabaseMaintenanceBackupRole = 'included' | 'excluded';

export type NativeDatabaseMaintenanceRebuildRole =
  | 'not-applicable'
  | 'rebuildable-from-main-data';

export interface NativeDatabaseMaintenanceEntry {
  backup_role: NativeDatabaseMaintenanceBackupRole;
  key: NativeDatabaseMaintenanceKey;
  rebuild_role: NativeDatabaseMaintenanceRebuildRole;
  size_bytes: number | null;
  state: NativeDatabaseMaintenanceState;
}

export interface NativeDatabaseMaintenanceStatus {
  entries: NativeDatabaseMaintenanceEntry[];
  updated_at: string;
}
