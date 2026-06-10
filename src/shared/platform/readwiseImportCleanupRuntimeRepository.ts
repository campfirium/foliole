import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  NativeReadwiseCleanupPreviewResult,
  NativeReadwiseCleanupRunResult
} from '../../../lib/platform/nativeContract';

import { refreshRuntimeExternalSearchFolders } from './externalSearchRuntimeRepository';
import { getRuntimeInvoke } from './runtimeInvoke';

export async function previewReadwiseImportCleanupInRuntime() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(
    NATIVE_COMMANDS.previewReadwiseImportCleanup
  ) as Promise<NativeReadwiseCleanupPreviewResult>;
}

export async function runReadwiseImportCleanupInRuntime() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(
    NATIVE_COMMANDS.runReadwiseImportCleanup
  ) as NativeReadwiseCleanupRunResult;
  await refreshRuntimeExternalSearchFolders();
  return result;
}
