export interface KeepImportRunEntry {
  action: 'import_attempted' | 'skipped';
  detail: string | null;
  failureReason: string | null;
  importStatus: 'blocked_deleted' | 'degraded' | 'duplicate' | 'failed' | 'imported' | null;
  previewStatus: 'blocked_deleted' | 'failed' | 'new' | 'unchanged' | 'updated';
  sourcePath: string;
}
