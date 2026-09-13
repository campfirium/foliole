export interface NativeDatabaseSpaceStatus {
  database_size_bytes: number;
  reclaimable_bytes: number;
  reclaimable_percent: number;
}

export interface NativeDatabaseCompactionResult {
  after: NativeDatabaseSpaceStatus;
  before: NativeDatabaseSpaceStatus;
  safety_snapshot_path: string;
}
