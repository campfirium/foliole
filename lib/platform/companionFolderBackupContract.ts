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

export interface CompanionFolderBackupPort {
  addListener(event: 'backupStateChanged', listener: (event: {
    state: CompanionFolderBackupState; result?: CompanionFolderDatabaseBackupResult;
  }) => void): Promise<{ remove(): Promise<void> }>;
  openSource(input: { sourceEpoch: string; databasePath: string }): Promise<void>;
  closeSource(input: { sourceEpoch: string }): Promise<void>;
  getState(): Promise<CompanionFolderBackupState>;
  clearDirectory(): Promise<CompanionFolderBackupState>;
  backupDatabase(input: { sourceEpoch: string; requestId: string; chooseDirectory: boolean }): Promise<CompanionFolderDatabaseBackupResult>;
  prepareAttachmentDirectory(input: { sourceEpoch: string; requestId: string }): Promise<void>;
  copyAttachment(input: { sourceEpoch: string; requestId: string; storageKey: string }): Promise<{ copied: boolean }>;
  deleteAttachment(input: { sourceEpoch: string; requestId: string; storageKey: string }): Promise<void>;
  finishAttachments(input: { requestId: string; copied: number; pending: number | null; errorMessage: string | null }): Promise<CompanionFolderBackupState>;
  cancelDatabase(input: { requestId: string }): Promise<void>;
}
