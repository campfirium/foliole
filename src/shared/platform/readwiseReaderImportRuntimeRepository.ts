import type { ImportManagerSettings } from '../../../lib/core/import/importManagerSettings';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  NativeReadwiseImportRunResult,
  NativeReadwiseSyncPreviewResult
} from '../../../lib/platform/nativeContract';

import { refreshRuntimeExternalSearchFolders } from './externalSearchRuntimeRepository';
import { getRuntimeInvoke } from './runtimeInvoke';

export function hasReadwiseReaderImportRuntimeRepository() {
  return Boolean(getRuntimeInvoke());
}

export async function previewReadwiseReaderImportInRuntime(
  settings: ImportManagerSettings
): Promise<NativeReadwiseSyncPreviewResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.previewReadwiseReaderImport, { settings });
}

export async function runReadwiseReaderImportInRuntime(
  settings: ImportManagerSettings
): Promise<NativeReadwiseImportRunResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.runReadwiseReaderImport, { settings });
  if (result) {
    await refreshRuntimeExternalSearchFolders();
  }
  return result;
}
