import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { toRuntimePdfImportsInventory, type RuntimePdfImportsInventory } from './pdfImportsRuntimePayloads';
import { loadRuntimeInventoryResult, type RuntimeInventoryLoadResult } from './runtimeInventoryLoadResult';

export function loadRuntimePdfImportsInventoryResult(): Promise<RuntimeInventoryLoadResult<RuntimePdfImportsInventory>> {
  return loadRuntimeInventoryResult({
    action: 'load_runtime_pdf_imports_inventory',
    command: NATIVE_COMMANDS.loadPdfImportsInventory,
    fallbackMessage: 'PDF imports inventory could not be loaded.',
    parse: toRuntimePdfImportsInventory
  });
}
