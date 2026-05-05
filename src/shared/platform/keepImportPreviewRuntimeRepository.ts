import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { toRuntimeKeepImportPreviewResult, type RuntimeKeepImportPreviewResult } from './keepImportPreviewPayloads';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type { RuntimeKeepImportPreviewEntry, RuntimeKeepImportPreviewResult } from './keepImportPreviewPayloads';

export async function previewRuntimeKeepImportRule(args: {
  directoryPath: string;
  highlightPolicy?: 'adopt' | 'reference_only';
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
