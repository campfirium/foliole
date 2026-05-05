import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';
import { resolveAppPaths } from '../ipc/paths.js';

import { FOLIOLE_DB_FILE } from './connection.js';
import {
  clearRuntimeDataPathsOverride,
  resolveLegacyAppDataRuntimeDataPaths,
  setRuntimeDataPathsOverride
} from './runtimeDataPaths.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

const MIGRATION_STATUS_FILE = 'library-data-migration.json';
const DATABASE_SIDE_CAR_SUFFIXES = ['', '-shm', '-wal'];

interface MigrationStatusRecord {
  copied_attachment_count: number;
  error: string | null;
  fallback_mode: 'legacy_appdata' | 'library';
  legacy_database_path: string;
  missing_attachment_count: number;
  status: 'completed' | 'failed';
  target_database_path: string;
  updated_at: string;
}

interface AttachmentCopyResult {
  copiedCount: number;
  failedPaths: string[];
  missingPaths: string[];
}

function resolveMigrationStatusFilePath() {
  return path.join(resolveAppPaths().app_config_dir, MIGRATION_STATUS_FILE);
}

function readMigrationStatus(): MigrationStatusRecord | null {
  const statusPath = resolveMigrationStatusFilePath();
  if (!fs.existsSync(statusPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(statusPath, 'utf8')) as MigrationStatusRecord;
  } catch {
    return null;
  }
}

function writeMigrationStatus(status: MigrationStatusRecord) {
  const statusPath = resolveMigrationStatusFilePath();
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
}

function resolveLegacyDatabasePath(appDataDir: string) {
  return path.join(appDataDir, FOLIOLE_DB_FILE);
}

function legacyDatabaseExists(legacyDatabasePath: string) {
  return fs.existsSync(legacyDatabasePath);
}

function removeDatabaseBundle(databasePath: string) {
  for (const suffix of DATABASE_SIDE_CAR_SUFFIXES) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

function copyFileAtomically(sourcePath: string, targetPath: string) {
  const tempPath = `${targetPath}.incoming-${process.pid}-${Date.now()}`;
  fs.copyFileSync(sourcePath, tempPath);
  fs.renameSync(tempPath, targetPath);
}

function copyDatabaseBundle(sourceDatabasePath: string, targetDatabasePath: string) {
  fs.mkdirSync(path.dirname(targetDatabasePath), { recursive: true });
  for (const suffix of DATABASE_SIDE_CAR_SUFFIXES) {
    const sourcePath = `${sourceDatabasePath}${suffix}`;
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    copyFileAtomically(sourcePath, `${targetDatabasePath}${suffix}`);
  }
}

function listAttachmentIds(databasePath: string) {
  const sqlite = new BetterSqlite3(databasePath, { fileMustExist: true, readonly: true });
  try {
    return sqlite.prepare('SELECT id FROM attachments ORDER BY id').all() as Array<{ id: string }>;
  } catch {
    return [];
  } finally {
    sqlite.close();
  }
}

function resolveLegacyAttachmentRoots(appDataDir: string) {
  return Array.from(new Set([path.join(appDataDir, 'Assets'), appDataDir]));
}

function findLegacyAttachmentPath(attachmentId: string, legacyRoots: string[]) {
  for (const root of legacyRoots) {
    const candidatePath = path.join(root, attachmentId);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  return null;
}

function copyMissingAttachments(attachmentIds: string[], legacyRoots: string[], targetAssetsDir: string): AttachmentCopyResult {
  let copiedCount = 0;
  const failedPaths: string[] = [];
  const missingPaths: string[] = [];
  fs.mkdirSync(targetAssetsDir, { recursive: true });
  for (const attachmentId of attachmentIds) {
    const targetPath = path.join(targetAssetsDir, attachmentId);
    if (fs.existsSync(targetPath)) {
      continue;
    }
    const sourcePath = findLegacyAttachmentPath(attachmentId, legacyRoots);
    if (!sourcePath) {
      missingPaths.push(attachmentId);
      continue;
    }
    try {
      copyFileAtomically(sourcePath, targetPath);
      copiedCount += 1;
    } catch {
      failedPaths.push(attachmentId);
    }
  }
  return { copiedCount, failedPaths, missingPaths };
}

function shouldReplaceTargetDatabase(status: MigrationStatusRecord | null, targetDatabasePath: string) {
  return Boolean(status && status.status === 'failed' && status.target_database_path === targetDatabasePath);
}

function recordCompletedMigration(
  legacyDatabasePath: string,
  targetDatabasePath: string,
  copiedAttachmentCount: number,
  missingAttachmentCount: number
) {
  writeMigrationStatus({
    copied_attachment_count: copiedAttachmentCount,
    error: null,
    fallback_mode: 'library',
    legacy_database_path: legacyDatabasePath,
    missing_attachment_count: missingAttachmentCount,
    status: 'completed',
    target_database_path: targetDatabasePath,
    updated_at: new Date().toISOString()
  });
}

function recordFailedMigration(legacyDatabasePath: string, targetDatabasePath: string, error: string) {
  writeMigrationStatus({
    copied_attachment_count: 0,
    error,
    fallback_mode: 'legacy_appdata',
    legacy_database_path: legacyDatabasePath,
    missing_attachment_count: 0,
    status: 'failed',
    target_database_path: targetDatabasePath,
    updated_at: new Date().toISOString()
  });
}

function shouldSkipMigration(status: MigrationStatusRecord | null, targetDatabasePath: string, legacyDatabasePath: string) {
  if (!legacyDatabaseExists(legacyDatabasePath)) {
    clearRuntimeDataPathsOverride();
    return true;
  }
  if (status?.status === 'completed' && fs.existsSync(targetDatabasePath)) {
    clearRuntimeDataPathsOverride();
    return true;
  }
  return false;
}

function runMigrationAttempt(legacyDatabasePath: string, targetDatabasePath: string, targetAssetsDir: string) {
  const appDataDir = path.dirname(legacyDatabasePath);
  const attachmentIds = listAttachmentIds(legacyDatabasePath).map((row) => row.id);
  if (!fs.existsSync(targetDatabasePath)) {
    copyDatabaseBundle(legacyDatabasePath, targetDatabasePath);
  }
  const copiedAttachments = copyMissingAttachments(
    attachmentIds,
    resolveLegacyAttachmentRoots(appDataDir),
    targetAssetsDir
  );
  if (copiedAttachments.failedPaths.length > 0) {
    throw new Error(`attachment copy failed: ${copiedAttachments.failedPaths.join(', ')}`);
  }
  if (attachmentIds.length > 0 && copiedAttachments.copiedCount === 0 && copiedAttachments.missingPaths.length > 0) {
    throw new Error(`legacy attachments not found: ${copiedAttachments.missingPaths.join(', ')}`);
  }
  return copiedAttachments;
}

function finalizeSuccessfulMigration(
  legacyDatabasePath: string,
  targetDatabasePath: string,
  copiedAttachmentCount: number,
  missingAttachmentCount: number
) {
  clearRuntimeDataPathsOverride();
  recordCompletedMigration(legacyDatabasePath, targetDatabasePath, copiedAttachmentCount, missingAttachmentCount);
  console.info('[library-data-migration] completed', {
    copiedAttachments: copiedAttachmentCount,
    legacyDatabasePath,
    missingAttachments: missingAttachmentCount,
    targetDatabasePath
  });
}

function finalizeFailedMigration(
  legacyDatabasePath: string,
  targetDatabasePath: string,
  error: unknown,
  appDataDir: string
) {
  removeDatabaseBundle(targetDatabasePath);
  setRuntimeDataPathsOverride(resolveLegacyAppDataRuntimeDataPaths(appDataDir));
  const message = error instanceof Error ? error.message : 'unknown migration failure';
  recordFailedMigration(legacyDatabasePath, targetDatabasePath, message);
  console.warn('[library-data-migration] fallback to legacy AppData storage', {
    error: message,
    legacyDatabasePath,
    targetDatabasePath
  });
}

export function prepareLibraryDataForStartup() {
  const appPaths = resolveAppPaths();
  const libraryPaths = loadLibraryPathSettingsSync();
  const legacyDatabasePath = resolveLegacyDatabasePath(appPaths.app_data_dir);
  const status = readMigrationStatus();

  if (shouldSkipMigration(status, libraryPaths.database_path, legacyDatabasePath)) {
    return;
  }

  try {
    if (shouldReplaceTargetDatabase(status, libraryPaths.database_path)) {
      removeDatabaseBundle(libraryPaths.database_path);
    }
    const copiedAttachments = runMigrationAttempt(legacyDatabasePath, libraryPaths.database_path, libraryPaths.assets_dir);
    finalizeSuccessfulMigration(
      legacyDatabasePath,
      libraryPaths.database_path,
      copiedAttachments.copiedCount,
      copiedAttachments.missingPaths.length
    );
  } catch (error) {
    finalizeFailedMigration(legacyDatabasePath, libraryPaths.database_path, error, appPaths.app_data_dir);
  }
}

export function resolveMigrationStatusFileForTest() {
  return resolveMigrationStatusFilePath();
}
