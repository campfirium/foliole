import {
  exportSourceDispositionsInRuntime,
  hasSettingsRuntimeRepository,
  importSourceDispositionsInRuntime,
  loadSourceDispositionSummaryFromRuntime,
  resetSourceDispositionsInRuntime,
  restoreSourceDispositionsInRuntime,
  type RuntimeExportSourceDispositionResult,
  type RuntimeImportSourceDispositionResult,
  type RuntimeSourceDispositionRestoreResult,
  type RuntimeSourceDispositionSummary
} from '../../../shared/platform/settingsRuntimeRepository';

export type SourceDispositionActionResult =
  | {
      ok: true;
      value:
        | RuntimeExportSourceDispositionResult
        | RuntimeImportSourceDispositionResult
        | RuntimeSourceDispositionRestoreResult
        | RuntimeSourceDispositionSummary;
    }
  | { ok: false; errorMessage: string };

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) return error.message.trim();
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) return message.trim();
  }
  return 'Unknown desktop runtime error.';
}

function normalizeSourceDispositionSummary(value: unknown): RuntimeSourceDispositionSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const recordCount = readNumber(payload.recordCount);
  const sizeBytes = readNumber(payload.sizeBytes);
  return recordCount === null || sizeBytes === null ? null : { recordCount, sizeBytes };
}

function normalizeSourceDispositionRestoreResult(value: unknown): RuntimeSourceDispositionRestoreResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const dismissedCount = readNumber(payload.dismissedCount);
  const trashedCount = readNumber(payload.trashedCount);
  return dismissedCount === null || trashedCount === null ? null : { dismissedCount, trashedCount };
}

function normalizeExportSourceDispositionResult(value: unknown): RuntimeExportSourceDispositionResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const entryCount = readNumber(payload.entryCount);
  if (entryCount === null) return null;
  if (payload.status === 'saved' && typeof payload.path === 'string') {
    return { entryCount, path: payload.path, status: 'saved' };
  }
  if ((payload.status === 'cancelled' || payload.status === 'save_failed') && payload.path === null) {
    return { entryCount, path: null, status: payload.status };
  }
  return null;
}

function normalizeImportSourceDispositionResult(value: unknown): RuntimeImportSourceDispositionResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const importedCount = readNumber(payload.importedCount);
  if (importedCount === null) return null;
  if (payload.status === 'imported') {
    const appliedDismissedCount = readNumber(payload.appliedDismissedCount);
    const appliedDeletedCount = readNumber(payload.appliedDeletedCount);
    const summary = normalizeSourceDispositionSummary(payload.summary);
    return summary && appliedDismissedCount !== null && appliedDeletedCount !== null
      ? { appliedDeletedCount, appliedDismissedCount, importedCount, status: 'imported', summary }
      : null;
  }
  if (
    (payload.status === 'cancelled' || payload.status === 'invalid_file' || payload.status === 'read_failed') &&
    payload.summary === null
  ) {
    return { importedCount, status: payload.status, summary: null };
  }
  return null;
}

export async function loadSourceDispositionSummary(): Promise<RuntimeSourceDispositionSummary> {
  if (!hasSettingsRuntimeRepository()) return { recordCount: 0, sizeBytes: 0 };
  try {
    return normalizeSourceDispositionSummary(await loadSourceDispositionSummaryFromRuntime()) ?? { recordCount: 0, sizeBytes: 0 };
  } catch {
    return { recordCount: 0, sizeBytes: 0 };
  }
}

export async function exportSourceDispositions(): Promise<SourceDispositionActionResult | null> {
  if (!hasSettingsRuntimeRepository()) return null;
  try {
    const result = normalizeExportSourceDispositionResult(await exportSourceDispositionsInRuntime());
    return result ? { ok: true, value: result } : { ok: false, errorMessage: 'Export completed but returned an invalid payload.' };
  } catch (error) {
    return { ok: false, errorMessage: readErrorMessage(error) };
  }
}

export async function importSourceDispositions(): Promise<SourceDispositionActionResult | null> {
  if (!hasSettingsRuntimeRepository()) return null;
  try {
    const result = normalizeImportSourceDispositionResult(await importSourceDispositionsInRuntime());
    return result ? { ok: true, value: result } : { ok: false, errorMessage: 'Import completed but returned an invalid payload.' };
  } catch (error) {
    return { ok: false, errorMessage: readErrorMessage(error) };
  }
}

export async function restoreSourceDispositions(): Promise<SourceDispositionActionResult | null> {
  if (!hasSettingsRuntimeRepository()) return null;
  try {
    const result = normalizeSourceDispositionRestoreResult(await restoreSourceDispositionsInRuntime());
    return result ? { ok: true, value: result } : { ok: false, errorMessage: 'Restore completed but returned an invalid payload.' };
  } catch (error) {
    return { ok: false, errorMessage: readErrorMessage(error) };
  }
}

export async function resetSourceDispositions(): Promise<SourceDispositionActionResult | null> {
  if (!hasSettingsRuntimeRepository()) return null;
  try {
    const result = normalizeSourceDispositionSummary(await resetSourceDispositionsInRuntime());
    return result ? { ok: true, value: result } : { ok: false, errorMessage: 'Reset completed but returned an invalid payload.' };
  } catch (error) {
    return { ok: false, errorMessage: readErrorMessage(error) };
  }
}
