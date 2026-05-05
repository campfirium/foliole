import type { NativeInvoke } from '../../../lib/platform/nativeContract';

import { recordDesktopDebugInvokeFailure } from './desktopDebugProbe';
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
    const request = args === undefined ? runtimeInvoke(command) : runtimeInvoke(command, args);
    return Promise.resolve(request).catch((error) => {
      recordDesktopDebugInvokeFailure({ command, args, error });
      throw error;
    });
  }) as RuntimeInvoke;
}
