import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveAppPaths } from '../ipc/paths.js';

const IMPORT_LOG_DIRNAME = 'import';
const READWISE_LOG_PREFIX = 'readwise-';
const IMPORT_LOG_SUFFIX = '.log';
const DEFAULT_RETENTION_DAYS = 7;

interface ReadwiseImportLogRecord {
  event:
    | 'readwise_scan_completed'
    | 'readwise_scan_failed'
    | 'readwise_scan_started'
    | 'readwise_source_completed'
    | 'readwise_source_started';
  timestamp: string;
  payload: Record<string, unknown>;
}

function formatDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function resolveImportLogDir() {
  return path.join(resolveAppPaths().app_log_dir, IMPORT_LOG_DIRNAME);
}

function resolveReadwiseLogPath(dateKey: string) {
  return path.join(resolveImportLogDir(), `${READWISE_LOG_PREFIX}${dateKey}${IMPORT_LOG_SUFFIX}`);
}

function isExpiredLogFile(fileName: string, cutoffDateKey: string) {
  if (!fileName.startsWith(READWISE_LOG_PREFIX) || !fileName.endsWith(IMPORT_LOG_SUFFIX)) {
    return false;
  }
  const dateKey = fileName.slice(READWISE_LOG_PREFIX.length, -IMPORT_LOG_SUFFIX.length);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dateKey < cutoffDateKey;
}

async function pruneExpiredLogs(logDir: string, retentionDays: number, now: Date) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - (retentionDays - 1));
  const cutoffDateKey = formatDateKey(cutoff);
  const entries = await fs.readdir(logDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && isExpiredLogFile(entry.name, cutoffDateKey))
      .map((entry) => fs.rm(path.join(logDir, entry.name), { force: true }))
  );
}

async function appendReadwiseImportLog(
  record: ReadwiseImportLogRecord,
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  try {
    const logDir = resolveImportLogDir();
    await fs.mkdir(logDir, { recursive: true });
    await pruneExpiredLogs(logDir, retentionDays, now);
    await fs.appendFile(resolveReadwiseLogPath(formatDateKey(now)), `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    // Readwise progress logging is diagnostic only; import execution must not depend on it.
  }
}

export async function logReadwiseScanStarted(
  input: { directoryPath: string; ruleId: string },
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  await appendReadwiseImportLog({
    event: 'readwise_scan_started',
    timestamp: now.toISOString(),
    payload: { directory_path: input.directoryPath, rule_id: input.ruleId }
  }, now, retentionDays);
}

export async function logReadwiseSourceStarted(
  input: { directoryPath: string; ruleId: string; sourcePath: string },
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  await appendReadwiseImportLog({
    event: 'readwise_source_started',
    timestamp: now.toISOString(),
    payload: { directory_path: input.directoryPath, rule_id: input.ruleId, source_path: input.sourcePath }
  }, now, retentionDays);
}

export async function logReadwiseSourceCompleted(
  input: { durationMs: number; directoryPath: string; ruleId: string; sourcePath: string },
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  await appendReadwiseImportLog({
    event: 'readwise_source_completed',
    timestamp: now.toISOString(),
    payload: {
      directory_path: input.directoryPath,
      duration_ms: input.durationMs,
      rule_id: input.ruleId,
      source_path: input.sourcePath
    }
  }, now, retentionDays);
}

export async function logReadwiseScanCompleted(
  input: {
    blockedCount: number;
    directoryPath: string;
    discoveredCount: number;
    entries: Array<{
      action: 'import_attempted' | 'skipped';
      detail: string | null;
      failureReason: string | null;
      importStatus: 'blocked_deleted' | 'degraded' | 'duplicate' | 'failed' | 'imported' | null;
      previewStatus: 'blocked_deleted' | 'failed' | 'new' | 'unchanged' | 'updated';
      sourcePath: string;
    }>;
    failedCount: number;
    importedCount: number;
    ruleId: string;
    skippedCount: number;
  },
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  await appendReadwiseImportLog({
    event: 'readwise_scan_completed',
    timestamp: now.toISOString(),
    payload: {
      blocked_count: input.blockedCount,
      directory_path: input.directoryPath,
      discovered_count: input.discoveredCount,
      entries: input.entries.map((entry) => ({
        action: entry.action,
        detail: entry.detail,
        failure_reason: entry.failureReason,
        import_status: entry.importStatus,
        preview_status: entry.previewStatus,
        source_path: entry.sourcePath
      })),
      failed_count: input.failedCount,
      imported_count: input.importedCount,
      rule_id: input.ruleId,
      skipped_count: input.skippedCount
    }
  }, now, retentionDays);
}

export async function logReadwiseScanFailed(
  input: { directoryPath: string; error: unknown; ruleId: string },
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  await appendReadwiseImportLog({
    event: 'readwise_scan_failed',
    timestamp: now.toISOString(),
    payload: {
      directory_path: input.directoryPath,
      error: input.error instanceof Error ? input.error.message : String(input.error),
      rule_id: input.ruleId
    }
  }, now, retentionDays);
}
