import type { CompanionRestoreCandidateSummary } from '../core/database/companionRestoreCandidate.js';

export type CompanionBackupRestoreSource = 'zip' | 'folder';

export type CompanionBackupRestoreStageResult =
  | { cancelled: true }
  | {
    cancelled: false;
    /** Capacitor SQLite database name of the staged copy. */
    database: string;
    sourceLabel: string;
    storageKeys: string[];
    skippedFiles: number;
    damagedFiles: number;
  };

export interface CompanionBackupRestorePort {
  stage(input: { source: CompanionBackupRestoreSource }): Promise<CompanionBackupRestoreStageResult>;
  cancel(): Promise<void>;
  discard(): Promise<void>;
  /** Replace the library with the staged candidate, keeping the replaced one as the previous library. */
  commit(): Promise<void>;
  previous(): Promise<{ exists: boolean; savedAt: string | null }>;
  addListener(event: 'restoreProgress', listener: (event: { bytes: number; files: number }) => void):
    Promise<{ remove(): Promise<void> }>;
}

export interface CompanionBackupRestoreSummary extends CompanionRestoreCandidateSummary {
  sourceLabel: string;
  skippedFiles: number;
  damagedFiles: number;
}

export type CompanionBackupRestoreStaged = { cancelled: true } | { cancelled: false; summary: CompanionBackupRestoreSummary };
