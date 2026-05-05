import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export interface RuntimeImportedTextFile {
  fileName: string;
  filePath: string;
  content: string;
  kind: 'markdown' | 'text';
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
