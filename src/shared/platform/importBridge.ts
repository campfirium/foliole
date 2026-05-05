import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import {
  toRuntimeDirectoryImportResult,
  toRuntimeImportedTextFile,
  toRuntimeImportOverview,
  toRuntimeTextImportResult,
  type RuntimeDirectoryImportResult,
  type RuntimeImportOverview,
  type RuntimeImportedTextFile,
  type RuntimeTextImportResult
} from './importBridgePayloads';
import { toRuntimeKeepImportPreviewResult, type RuntimeKeepImportPreviewResult } from './keepImportPreviewPayloads';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type ImportHighlightPolicy = 'adopt' | 'reference_only';
export type {
  RuntimeDirectoryImportEntry,
  RuntimeDirectoryImportResult,
  RuntimeImportOverview,
  RuntimeImportedTextFile,
  RuntimeTextImportResult
} from './importBridgePayloads';
export type { RuntimeKeepImportPreviewEntry, RuntimeKeepImportPreviewResult } from './keepImportPreviewPayloads';
export type {
  RuntimeKeepImportItemDetails,
  RuntimeNodeImportSource,
  RuntimeNodeSourceDetails,
  RuntimeNodeSourceUpdatePreview
} from './nodeSourceBridgePayloads';

export async function selectRuntimeImportDirectory(): Promise<string | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.selectImportDirectory);
    return typeof result === 'string' && result.trim().length > 0 ? result : null;
  } catch (error) {
    logRuntimeWarning('native import directory selection failed', {
      action: 'select_runtime_import_directory',
      area: 'bridge',
      command: NATIVE_COMMANDS.selectImportDirectory,
      fallback: 'rethrow_to_ui',
      error
    });
    throw error;
  }
}

function toImportArgs(highlightPolicy?: ImportHighlightPolicy) {
  return highlightPolicy ? { highlight_policy: highlightPolicy } : {};
}

export async function selectRuntimeImportTextFile(
  highlightPolicy?: ImportHighlightPolicy
): Promise<RuntimeImportedTextFile | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.selectImportTextFile, toImportArgs(highlightPolicy));
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
  highlightPolicy?: ImportHighlightPolicy
): Promise<RuntimeTextImportResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.runTextFileImport, toImportArgs(highlightPolicy));
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

export async function runRuntimeDirectoryImport(): Promise<RuntimeDirectoryImportResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.runDirectoryImport, {});
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

export async function previewRuntimeKeepImportRule(args: {
  directoryPath: string;
  highlightPolicy?: ImportHighlightPolicy;
  ruleId: string;
  sourceType?: 'generic' | 'readwise';
}): Promise<RuntimeKeepImportPreviewResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const result = toRuntimeKeepImportPreviewResult(
      await runtimeInvoke(NATIVE_COMMANDS.previewKeepImportRule, {
        directory_path: args.directoryPath,
        highlight_policy: args.highlightPolicy,
        source_type: args.sourceType,
        rule_id: args.ruleId
      })
    );
    if (!result) {
      logRuntimeWarning('native keep import preview payload invalid', {
        action: 'preview_runtime_keep_import_rule',
        area: 'bridge',
        command: NATIVE_COMMANDS.previewKeepImportRule,
        fallback: 'return_null'
      });
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native keep import preview failed', {
      action: 'preview_runtime_keep_import_rule',
      area: 'bridge',
      command: NATIVE_COMMANDS.previewKeepImportRule,
      fallback: 'rethrow_to_ui',
      error
    });
    throw error;
  }
}

export async function loadRuntimeImportOverview(): Promise<RuntimeImportOverview | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const overview = toRuntimeImportOverview(await runtimeInvoke(NATIVE_COMMANDS.loadImportOverview));
    if (!overview) {
      logRuntimeWarning('native import overview payload invalid', {
        action: 'load_runtime_import_overview',
        area: 'bridge',
        command: NATIVE_COMMANDS.loadImportOverview,
        fallback: 'return_null'
      });
    }
    return overview;
  } catch (error) {
    logRuntimeWarning('native import overview loading failed', {
      action: 'load_runtime_import_overview',
      area: 'bridge',
      command: NATIVE_COMMANDS.loadImportOverview,
      fallback: 'return_null',
      error
    });
    return null;
  }
}


export async function resetRuntimeImportData() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  return runtimeInvoke(NATIVE_COMMANDS.resetImportData);
}
