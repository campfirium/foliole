import { COMPANION_DATABASE_NAME } from './nativeCompanionContract.js';

export const COMPANION_FOLDER_BACKUP_FILES = {
  databaseName: COMPANION_DATABASE_NAME,
  databaseFileName: 'Foliole.sqlite'
} as const;

export interface CompanionFolderBackupState {
  configured: boolean;
  directoryLabel: string | null;
  directoryId?: string | null;
  databaseSavedAt: string | null;
  phase: 'idle' | 'working' | 'pending' | 'saved' | 'failed';
  errorMessage: string | null;
  pendingItems?: number | null;
  attachmentFilesCopied?: number;
  attachmentFilesPending?: number | null;
}

export interface CompanionFolderDatabaseBackupResult {
  requestId: string;
  cancelled: boolean;
  databaseCommitted: boolean;
  sourcePages: number;
  changedPages: number;
  state: CompanionFolderBackupState;
}

/** Most keys a single native copy call accepts; bounds cancellation latency and the result payload. */
export const COMPANION_FOLDER_ATTACHMENT_COPY_BATCH = 32;

export type CompanionFolderAttachmentCopyResult =
  | { storageKey: string; copied: boolean; errorMessage?: undefined }
  | { storageKey: string; errorMessage: string; copied?: undefined };

export interface CompanionFolderBackupPort {
  addListener(event: 'backupStateChanged', listener: (event: {
    state: CompanionFolderBackupState; result?: CompanionFolderDatabaseBackupResult;
  }) => void): Promise<{ remove(): Promise<void> }>;
  /** `reclaim` marks the first owner of a newly loaded page: native ends a round left by an earlier page as
   * interrupted (waiting for its running operation to stop) instead of refusing the new owner. */
  openSource(input: { sourceEpoch: string; databasePath: string; reclaim?: boolean }): Promise<void>;
  closeSource(input: { sourceEpoch: string }): Promise<void>;
  getState(): Promise<CompanionFolderBackupState>;
  clearDirectory(): Promise<CompanionFolderBackupState>;
  /** `replaceExisting` is the user's confirmation that a backup this library does not own may be overwritten. */
  backupDatabase(input: {
    sourceEpoch: string; requestId: string; chooseDirectory: boolean; replaceExisting?: boolean;
  }): Promise<CompanionFolderDatabaseBackupResult>;
  /** Probe without creating so the source inventory can be recorded before a missing folder is rebuilt. */
  prepareAttachmentDirectory(input: { sourceEpoch: string; requestId: string; create: boolean }): Promise<{ exists: boolean }>;
  /** Copies keys in order in one native call. A key without a result was not attempted (the request was cancelled). */
  copyAttachments(input: { sourceEpoch: string; requestId: string; storageKeys: string[] }): Promise<{
    results: CompanionFolderAttachmentCopyResult[];
  }>;
  /** Lets the in-flight copy finish its current file, then return without attempting the remaining keys. */
  stopAttachments(input: { requestId: string }): Promise<void>;
  deleteAttachment(input: { sourceEpoch: string; requestId: string; storageKey: string }): Promise<void>;
  finishAttachments(input: { requestId: string; copied: number; pending: number | null; errorMessage: string | null }): Promise<CompanionFolderBackupState>;
  /** Releases this request if its round is still open; with `errorMessage` the open round ends as failed with that error. */
  cancelDatabase(input: { requestId: string; errorMessage?: string }): Promise<void>;
}
