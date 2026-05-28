export interface NativeSourceDispositionSummary {
  recordCount: number;
  sizeBytes: number;
}

export interface NativeSourceDispositionRestoreResult {
  dismissedCount: number;
  trashedCount: number;
}

export type NativeExportSourceDispositionResult =
  | {
      status: 'saved';
      path: string;
      entryCount: number;
    }
  | {
      status: 'cancelled' | 'save_failed';
      path: null;
      entryCount: number;
    };

export type NativeImportSourceDispositionResult =
  | {
      status: 'imported';
      appliedDismissedCount: number;
      appliedDeletedCount: number;
      importedCount: number;
      summary: NativeSourceDispositionSummary;
    }
  | {
      status: 'cancelled' | 'invalid_file' | 'read_failed';
      importedCount: number;
      summary: null;
    };
