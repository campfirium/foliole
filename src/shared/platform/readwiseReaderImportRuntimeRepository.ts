import type { ImportManagerSettings } from '../../../lib/core/import/importManagerSettings';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeReadwiseImportRunResult, NativeReadwiseSyncPreviewResult } from '../../../lib/platform/nativeContract';
import type {
  NativeReadwiseImportCancelResult,
  NativeReadwiseReconcileCancelResult,
  NativeReadwiseReconcileResult
} from '../../../lib/platform/nativeReadwiseApiImportContract';

import { refreshRuntimeExternalSearchFolders } from './externalSearchRuntimeRepository';
import { getRuntimeInvoke } from './runtimeInvoke';

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

export async function cancelReadwiseReaderImportInRuntime(): Promise<NativeReadwiseImportCancelResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.cancelReadwiseReaderImport);
}

export async function runReadwiseApiReconcileInRuntime(): Promise<NativeReadwiseReconcileResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  return runtimeInvoke ? runtimeInvoke(NATIVE_COMMANDS.runReadwiseApiReconcile) : null;
}

export async function cancelReadwiseApiReconcileInRuntime(): Promise<NativeReadwiseReconcileCancelResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  return runtimeInvoke ? runtimeInvoke(NATIVE_COMMANDS.cancelReadwiseApiReconcile) : null;
}
