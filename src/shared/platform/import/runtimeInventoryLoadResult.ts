import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';
import { logRuntimeWarning } from '../runtimeLogging';

export type RuntimeInventoryLoadResult<T> =
  | { inventory: T; status: 'loaded' }
  | { status: 'unavailable' }
  | { message: string; status: 'failed' };

function formatRuntimeInventoryError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return fallback;
}

export async function loadRuntimeInventoryResult<T>(input: {
  action: string;
  command: (typeof NATIVE_COMMANDS)[keyof typeof NATIVE_COMMANDS];
  fallbackMessage: string;
  parse: (value: unknown) => T | null;
}): Promise<RuntimeInventoryLoadResult<T>> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return { status: 'unavailable' };
  }

  try {
    const inventory = input.parse(await runtimeInvoke(input.command));
    if (inventory) {
      return { inventory, status: 'loaded' };
    }
    logRuntimeWarning('native inventory payload invalid', {
      action: input.action,
      area: 'bridge',
      command: input.command,
      fallback: 'return_failed'
    });
    return { message: input.fallbackMessage, status: 'failed' };
  } catch (error) {
    logRuntimeWarning('native inventory loading failed', {
      action: input.action,
      area: 'bridge',
      command: input.command,
      fallback: 'return_failed',
      error
    });
    return { message: formatRuntimeInventoryError(error, input.fallbackMessage), status: 'failed' };
  }
}
