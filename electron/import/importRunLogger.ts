import fs from 'node:fs/promises';
import path from 'node:path';

import type { NativeDirectoryImportResult } from '../../lib/platform/nativeContract.js';
import { resolveAppPaths } from '../ipc/paths.js';

const IMPORT_LOG_DIRNAME = 'import';
const IMPORT_LOG_PREFIX = 'import-';
const IMPORT_LOG_SUFFIX = '.log';
const DEFAULT_RETENTION_DAYS = 7;

interface ImportLogRecord {
  event: 'directory_import_completed' | 'directory_import_failed';
  timestamp: string;
  payload: Record<string, unknown>;
}

interface ReadwiseImportLogRecord {
  event: 'readwise_scan_completed' | 'readwise_scan_failed' | 'readwise_scan_started';
  timestamp: string;
  payload: Record<string, unknown>;
}

function formatDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function resolveImportLogDir() {
  return path.join(resolveAppPaths().app_log_dir, IMPORT_LOG_DIRNAME);
}

function resolveLogPath(dateKey: string) {
  return path.join(resolveImportLogDir(), `${IMPORT_LOG_PREFIX}${dateKey}${IMPORT_LOG_SUFFIX}`);
}

function resolveReadwiseLogPath(dateKey: string) {
  return path.join(resolveImportLogDir(), `readwise-${dateKey}${IMPORT_LOG_SUFFIX}`);
}

function isExpiredLogFile(fileName: string, cutoffDateKey: string) {
  if (!fileName.startsWith(IMPORT_LOG_PREFIX) || !fileName.endsWith(IMPORT_LOG_SUFFIX)) {
    return false;
  }
  const dateKey = fileName.slice(IMPORT_LOG_PREFIX.length, -IMPORT_LOG_SUFFIX.length);
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

function summarizeEntries(result: NativeDirectoryImportResult) {
  return result.entries.map((entry) => ({
    failure_reason: entry.failure_reason,
    imported_at: entry.imported_at,
    result_status: entry.result_status,
    source_name: entry.source_name
  }));
}

async function appendImportLog(record: ImportLogRecord, now = new Date(), retentionDays = DEFAULT_RETENTION_DAYS) {
  const logDir = resolveImportLogDir();
  await fs.mkdir(logDir, { recursive: true });
  await pruneExpiredLogs(logDir, retentionDays, now);
  await fs.appendFile(resolveLogPath(formatDateKey(now)), `${JSON.stringify(record)}\n`, 'utf8');
}

async function appendReadwiseImportLog(
  record: ReadwiseImportLogRecord,
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  const logDir = resolveImportLogDir();
  await fs.mkdir(logDir, { recursive: true });
  await pruneExpiredLogs(logDir, retentionDays, now);
  await fs.appendFile(resolveReadwiseLogPath(formatDateKey(now)), `${JSON.stringify(record)}\n`, 'utf8');
}

export async function logDirectoryImportCompleted(
  result: NativeDirectoryImportResult,
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  await appendImportLog(
    {
      event: 'directory_import_completed',
      timestamp: now.toISOString(),
      payload: {
        archive_root_path: result.archive_root_path,
        consume_policy: result.consume_policy,
        consumed_count: result.consumed_count,
        discovered_count: result.discovered_count,
        entries: summarizeEntries(result),
        failed_count: result.failed_count,
        imported_count: result.imported_count,
        source_adapter: result.source_adapter
      }
    },
    now,
    retentionDays
  );
}

export async function logDirectoryImportFailed(
  sourceAdapter: string,
  error: unknown,
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  await appendImportLog(
    {
      event: 'directory_import_failed',
      timestamp: now.toISOString(),
      payload: {
        error: error instanceof Error ? error.message : String(error),
        source_adapter: sourceAdapter
      }
    },
    now,
    retentionDays
  );
}

export async function logReadwiseScanStarted(
  input: { directoryPath: string; ruleId: string },
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  await appendReadwiseImportLog(
    {
      event: 'readwise_scan_started',
      timestamp: now.toISOString(),
      payload: {
        directory_path: input.directoryPath,
        rule_id: input.ruleId
      }
    },
    now,
    retentionDays
  );
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
  await appendReadwiseImportLog(
    {
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
    },
    now,
    retentionDays
  );
}

export async function logReadwiseScanFailed(
  input: { directoryPath: string; error: unknown; ruleId: string },
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  await appendReadwiseImportLog(
    {
      event: 'readwise_scan_failed',
      timestamp: now.toISOString(),
      payload: {
        directory_path: input.directoryPath,
        error: input.error instanceof Error ? input.error.message : String(input.error),
        rule_id: input.ruleId
      }
    },
    now,
    retentionDays
  );
}
