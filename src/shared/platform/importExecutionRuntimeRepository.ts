import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import {
  toRuntimeDirectoryImportResult,
  toRuntimeImportedTextFile,
  toRuntimeTextImportResult,
  type RuntimeDirectoryImportResult,
  type RuntimeImportedTextFile,
  type RuntimeTextImportResult
} from './importRuntimePayloads';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type ImportHighlightPolicy = 'adopt' | 'reference_only';
export type ImportNodeTitleStrategy = 'file_name' | 'heading';
export type {
  RuntimeDirectoryImportEntry,
  RuntimeDirectoryImportResult,
  RuntimeImportedTextFile,
  RuntimeTextImportResult
} from './importRuntimePayloads';

function toImportArgs(highlightPolicy?: ImportHighlightPolicy, titleStrategy?: ImportNodeTitleStrategy) {
  return {
    ...(highlightPolicy ? { highlight_policy: highlightPolicy } : {}),
    ...(titleStrategy ? { title_strategy: titleStrategy } : {})
  };
}

export async function selectRuntimeImportTextFile(
  highlightPolicy?: ImportHighlightPolicy,
  titleStrategy?: ImportNodeTitleStrategy
): Promise<RuntimeImportedTextFile | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.selectImportTextFile, toImportArgs(highlightPolicy, titleStrategy));
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

export async function runRuntimeTextFileImport(
  highlightPolicy?: ImportHighlightPolicy,
  titleStrategy?: ImportNodeTitleStrategy
): Promise<RuntimeTextImportResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.runTextFileImport, toImportArgs(highlightPolicy, titleStrategy));
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

export async function runRuntimeClipboardImport(
  highlightPolicy?: ImportHighlightPolicy,
  titleStrategy?: ImportNodeTitleStrategy
): Promise<RuntimeTextImportResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.runClipboardImport, toImportArgs(highlightPolicy, titleStrategy));
    if (result === null) {
      return null;
    }
    const imported = toRuntimeTextImportResult(result);
    if (!imported) {
      logRuntimeWarning('native clipboard import payload invalid', {
        action: 'run_runtime_clipboard_import',
        area: 'bridge',
        command: NATIVE_COMMANDS.runClipboardImport,
        fallback: 'return_null'
      });
    }
    return imported;
  } catch (error) {
    logRuntimeWarning('native clipboard import failed', {
      action: 'run_runtime_clipboard_import',
      area: 'bridge',
      command: NATIVE_COMMANDS.runClipboardImport,
      fallback: 'rethrow_to_ui',
      error
    });
    throw error;
  }
}

export async function runRuntimeDirectoryImport(titleStrategy?: ImportNodeTitleStrategy): Promise<RuntimeDirectoryImportResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.runDirectoryImport, toImportArgs(undefined, titleStrategy));
    if (result === null) {
      return null;
    }
    const importedDirectory = toRuntimeDirectoryImportResult(result);
    if (!importedDirectory) {
      logRuntimeWarning('native directory import payload invalid', {
        action: 'run_runtime_directory_import',
        area: 'bridge',
        command: NATIVE_COMMANDS.runDirectoryImport,
        fallback: 'return_null'
      });
    }
    return importedDirectory;
  } catch (error) {
    logRuntimeWarning('native directory import failed', {
      action: 'run_runtime_directory_import',
      area: 'bridge',
      command: NATIVE_COMMANDS.runDirectoryImport,
      fallback: 'rethrow_to_ui',
      error
    });
    throw error;
  }
}
