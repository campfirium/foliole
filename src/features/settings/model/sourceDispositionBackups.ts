import {
  hasSettingsRuntimeRepository,
  loadSourceDispositionSummaryFromRuntime,
  resetSourceDispositionsInRuntime,
  restoreSourceDispositionsInRuntime,
  type RuntimeSourceDispositionRestoreResult,
  type RuntimeSourceDispositionSummary
} from '../../../shared/platform/settingsRuntimeRepository';

export type SourceDispositionActionResult =
  | { ok: true; value: RuntimeSourceDispositionRestoreResult | RuntimeSourceDispositionSummary }
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

export async function loadSourceDispositionSummary(): Promise<RuntimeSourceDispositionSummary> {
  if (!hasSettingsRuntimeRepository()) return { recordCount: 0, sizeBytes: 0 };
  try {
    return normalizeSourceDispositionSummary(await loadSourceDispositionSummaryFromRuntime()) ?? { recordCount: 0, sizeBytes: 0 };
  } catch {
    return { recordCount: 0, sizeBytes: 0 };
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
