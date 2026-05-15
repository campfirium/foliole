import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { toRuntimeReadwiseBooksInventory, type RuntimeReadwiseBooksInventory } from './readwiseBooksRuntimePayloads';
import { loadRuntimeInventoryResult, type RuntimeInventoryLoadResult } from './runtimeInventoryLoadResult';

export function loadRuntimeReadwiseBooksInventoryResult(): Promise<RuntimeInventoryLoadResult<RuntimeReadwiseBooksInventory>> {
  return loadRuntimeInventoryResult({
    action: 'load_runtime_readwise_books_inventory',
    command: NATIVE_COMMANDS.loadReadwiseBooksInventory,
    fallbackMessage: 'Readwise Books inventory could not be loaded.',
    parse: toRuntimeReadwiseBooksInventory
  });
}
