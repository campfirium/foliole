import type { NativeInvoke } from '../../../lib/platform/nativeContract';

import { recordDesktopDebugInvoke, recordDesktopDebugInvokeFailure } from './desktopDebugProbe';
import { getElectronAPI } from './electronApi';
import { isDesktopRuntime } from './runtime';

export type RuntimeInvoke = NativeInvoke;

export function getRuntimeInvoke(): RuntimeInvoke | null {
  if (!isDesktopRuntime()) {
    return null;
  }

  const runtimeInvoke = getElectronAPI()?.invoke;
  if (!runtimeInvoke) {
    return null;
  }

  return ((command: string, args?: Record<string, unknown>) => {
    const startedAt = Date.now();
    const request = args === undefined ? runtimeInvoke(command) : runtimeInvoke(command, args);
    return Promise.resolve(request)
      .then((result) => {
        recordDesktopDebugInvoke({
          command,
          args,
          durationMs: Date.now() - startedAt,
          status: 'resolved'
        });
        return result;
      })
      .catch((error) => {
        recordDesktopDebugInvoke({
          command,
          args,
          durationMs: Date.now() - startedAt,
          error,
          status: 'rejected'
        });
        recordDesktopDebugInvokeFailure({ command, args, error });
        throw error;
      });
  }) as RuntimeInvoke;
}

export function isRuntimeInvokeAvailable() {
  return Boolean(getRuntimeInvoke());
}
