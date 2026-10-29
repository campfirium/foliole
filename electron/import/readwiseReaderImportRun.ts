import { normalizeImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import type { NativeReadwiseImportRunResult } from '../../lib/platform/nativeImportContract.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { cancelReadwiseApiImport, runReadwiseApiImport } from './readwiseApiImportRun.js';
import type { ReadwiseImportProgressWindow } from './readwiseReaderRunAccumulator.js';
import { runReadwiseReaderImportNow } from './readwiseRelayImportExecution.js';

interface ActiveReadwiseReaderImport {
  controller: AbortController;
  promise: Promise<NativeReadwiseImportRunResult>;
}

let activeReadwiseReaderImport: ActiveReadwiseReaderImport | null = null;

export async function runReadwiseReaderImport(input?: {
  onRelayCompleted?: (result: NativeReadwiseImportRunResult) => void;
  settings?: unknown;
  window?: ReadwiseImportProgressWindow | null;
}): Promise<NativeReadwiseImportRunResult> {
  const settings = input?.settings
    ? normalizeImportManagerSettings(input.settings)
    : loadImportManagerSettings();
  if (settings.readwiseSourceMode === 'api') return runReadwiseApiImport({ ...input, settings });
  if (activeReadwiseReaderImport) {
    return activeReadwiseReaderImport.promise;
  }
  const controller = new AbortController();
  const promise = runReadwiseReaderImportNow(input, controller.signal).then(result => {
    input?.onRelayCompleted?.(result);
    return result;
  }).finally(() => {
    if (activeReadwiseReaderImport?.controller === controller) {
      activeReadwiseReaderImport = null;
    }
  });
  activeReadwiseReaderImport = { controller, promise };
  return promise;
}

export function cancelReadwiseReaderImport() {
  if (!activeReadwiseReaderImport) {
    return cancelReadwiseApiImport();
  }
  activeReadwiseReaderImport.controller.abort();
  return { status: 'cancelled' as const };
}
