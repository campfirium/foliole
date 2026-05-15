import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { loadRuntimeInventoryResult, type RuntimeInventoryLoadResult } from './import/runtimeInventoryLoadResult';
import { toRuntimePdfImportsInventory, type RuntimePdfImportsInventory } from './pdfImportsRuntimePayloads';

export function loadRuntimePdfImportsInventoryResult(): Promise<RuntimeInventoryLoadResult<RuntimePdfImportsInventory>> {
  return loadRuntimeInventoryResult({
    action: 'load_runtime_pdf_imports_inventory',
    command: NATIVE_COMMANDS.loadPdfImportsInventory,
    fallbackMessage: 'PDF imports inventory could not be loaded.',
    parse: toRuntimePdfImportsInventory
  });
}
