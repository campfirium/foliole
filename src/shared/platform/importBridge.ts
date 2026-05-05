import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export interface RuntimeImportedTextFile {
  fileName: string;
  filePath: string;
  content: string;
  kind: 'markdown' | 'text';
}

export interface RuntimeTextImportResult {
  contentFingerprint: string;
  degradedReason: string | null;
  duplicateSemantic: 'new' | 'updated' | 'duplicate';
  failureReason: string | null;
  importId: string;
  importedAt: string;
  nodeId: string | null;
  provider: 'desktop_text_file';
  resultStatus: 'imported' | 'degraded' | 'failed';
  sourceFingerprint: string;
  sourceKind: 'markdown' | 'text';
  sourceLocator: string;
  sourceName: string;
}

function isImportKind(value: unknown): value is RuntimeImportedTextFile['kind'] {
  return value === 'markdown' || value === 'text';
}

function toRuntimeImportedTextFile(value: unknown): RuntimeImportedTextFile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.file_name !== 'string' ||
    typeof payload.file_path !== 'string' ||
    typeof payload.content !== 'string' ||
    !isImportKind(payload.kind)
  ) {
    return null;
  }
  return {
    content: payload.content,
    fileName: payload.file_name,
    filePath: payload.file_path,
    kind: payload.kind
  };
}

function isImportSemantic(value: unknown): value is RuntimeTextImportResult['duplicateSemantic'] {
  return value === 'new' || value === 'updated' || value === 'duplicate';
}

function isImportResultStatus(value: unknown): value is RuntimeTextImportResult['resultStatus'] {
  return value === 'imported' || value === 'degraded' || value === 'failed';
}

function toRuntimeTextImportResult(value: unknown): RuntimeTextImportResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.import_id !== 'string' ||
    payload.provider !== 'desktop_text_file' ||
    typeof payload.source_name !== 'string' ||
    typeof payload.source_locator !== 'string' ||
    !isImportKind(payload.source_kind) ||
    typeof payload.source_fingerprint !== 'string' ||
    typeof payload.content_fingerprint !== 'string' ||
    !isImportSemantic(payload.duplicate_semantic) ||
    !isImportResultStatus(payload.result_status) ||
    typeof payload.imported_at !== 'string' ||
    (payload.node_id !== null && typeof payload.node_id !== 'string') ||
    (payload.degraded_reason !== null && typeof payload.degraded_reason !== 'string') ||
    (payload.failure_reason !== null && typeof payload.failure_reason !== 'string')
  ) {
    return null;
  }
  return {
    contentFingerprint: payload.content_fingerprint,
    degradedReason: payload.degraded_reason,
    duplicateSemantic: payload.duplicate_semantic,
    failureReason: payload.failure_reason,
    importId: payload.import_id,
    importedAt: payload.imported_at,
    nodeId: payload.node_id,
    provider: payload.provider,
    resultStatus: payload.result_status,
    sourceFingerprint: payload.source_fingerprint,
    sourceKind: payload.source_kind,
    sourceLocator: payload.source_locator,
    sourceName: payload.source_name
  };
}

export async function selectRuntimeImportTextFile(): Promise<RuntimeImportedTextFile | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.selectImportTextFile);
    if (result === null) {
      return null;
    }
    const importedFile = toRuntimeImportedTextFile(result);
    if (!importedFile) {
      logRuntimeWarning('native import file payload invalid', {
        action: 'select_runtime_import_text_file',
        area: 'bridge',
        command: NATIVE_COMMANDS.selectImportTextFile,
        fallback: 'return_null'
      });
    }
    return importedFile;
  } catch (error) {
    logRuntimeWarning('native import file selection failed', {
      action: 'select_runtime_import_text_file',
      area: 'bridge',
      command: NATIVE_COMMANDS.selectImportTextFile,
      fallback: 'rethrow_to_ui',
      error
    });
    throw error;
  }
}

export async function runRuntimeTextFileImport(): Promise<RuntimeTextImportResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.runTextFileImport);
    if (result === null) {
      return null;
    }
    const importedFile = toRuntimeTextImportResult(result);
    if (!importedFile) {
      logRuntimeWarning('native text import payload invalid', {
        action: 'run_runtime_text_file_import',
        area: 'bridge',
        command: NATIVE_COMMANDS.runTextFileImport,
        fallback: 'return_null'
      });
    }
    return importedFile;
  } catch (error) {
    logRuntimeWarning('native text import failed', {
      action: 'run_runtime_text_file_import',
      area: 'bridge',
      command: NATIVE_COMMANDS.runTextFileImport,
      fallback: 'rethrow_to_ui',
      error
    });
    throw error;
  }
}
