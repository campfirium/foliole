import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import {
  toRuntimeReadwiseBooksInventory,
  type RuntimeReadwiseBooksInventory
} from './readwiseBooksBridgePayloads';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type { RuntimeReadwiseBooksInventory } from './readwiseBooksBridgePayloads';

export async function loadRuntimeReadwiseBooksInventory(): Promise<RuntimeReadwiseBooksInventory | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const inventory = toRuntimeReadwiseBooksInventory(await runtimeInvoke(NATIVE_COMMANDS.loadReadwiseBooksInventory));
    if (!inventory) {
      logRuntimeWarning('native readwise books inventory payload invalid', {
        action: 'load_runtime_readwise_books_inventory',
        area: 'bridge',
        command: NATIVE_COMMANDS.loadReadwiseBooksInventory,
        fallback: 'return_null'
      });
    }
    return inventory;
  } catch (error) {
    logRuntimeWarning('native readwise books inventory loading failed', {
      action: 'load_runtime_readwise_books_inventory',
      area: 'bridge',
      command: NATIVE_COMMANDS.loadReadwiseBooksInventory,
      fallback: 'return_null',
      error
    });
    return null;
  }
}
