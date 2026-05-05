import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import {
  toRuntimePdfImportsInventory,
  type RuntimePdfImportInventoryItem,
  type RuntimePdfImportsInventory
} from './pdfImportsBridgePayloads';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type { RuntimePdfImportInventoryItem, RuntimePdfImportsInventory };

export async function loadRuntimePdfImportsInventory(): Promise<RuntimePdfImportsInventory | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const inventory = toRuntimePdfImportsInventory(await runtimeInvoke(NATIVE_COMMANDS.loadPdfImportsInventory));
    if (!inventory) {
      logRuntimeWarning('native pdf imports inventory payload invalid', {
        action: 'load_runtime_pdf_imports_inventory',
        area: 'repository',
        command: NATIVE_COMMANDS.loadPdfImportsInventory,
        fallback: 'return_null'
      });
    }
    return inventory;
  } catch (error) {
    logRuntimeWarning('native pdf imports inventory loading failed', {
      action: 'load_runtime_pdf_imports_inventory',
      area: 'repository',
      command: NATIVE_COMMANDS.loadPdfImportsInventory,
      fallback: 'return_null',
      error
    });
    return null;
  }
}
