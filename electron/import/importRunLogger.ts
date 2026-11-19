import type { NativeDirectoryImportResult, NativeDirectoryImportSourceAdapter } from '../../lib/platform/nativeImportContract.js';
import { appendDiagnosticLog } from '../diagnostics/diagnosticLog.js';

export async function logDirectoryImportCompleted(result: NativeDirectoryImportResult, now = new Date()) {
  const { consumed_count, discovered_count, failed_count, imported_count, source_adapter } = result;
  await appendDiagnosticLog({
    event: 'directory_import_completed',
    level: failed_count > 0 ? 'warn' : 'info',
    occurred_at: now.toISOString(),
    payload: {
      operation: 'directory_import',
      source_kind: source_adapter,
      status: failed_count > 0 ? 'incomplete' : 'completed',
      consumed_count,
      discovered_count,
      failed_count,
      imported_count
    },
    source: 'electron.import'
  }, now);
}

export async function logDirectoryImportFailed(sourceAdapter: NativeDirectoryImportSourceAdapter, error: unknown) {
  await appendDiagnosticLog({
    event: 'directory_import_failed',
    level: 'error',
    occurred_at: new Date().toISOString(),
    payload: {
      operation: 'directory_import',
      source_kind: sourceAdapter,
      status: 'failed',
      reason: error instanceof Error ? 'exception' : 'unknown'
    },
    source: 'electron.import'
  });
}
