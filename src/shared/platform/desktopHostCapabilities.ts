import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';

export interface DesktopHostCapabilities {
  globalCaptureSupported: boolean;
  loginItemSupported: boolean;
}

const unsupportedCapabilities: DesktopHostCapabilities = {
  globalCaptureSupported: false,
  loginItemSupported: false
};

export async function loadDesktopHostCapabilities(): Promise<DesktopHostCapabilities> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return unsupportedCapabilities;
  const value = await invoke(NATIVE_COMMANDS.loadDesktopHostCapabilities);
  return {
    globalCaptureSupported: value?.globalCaptureSupported === true,
    loginItemSupported: value?.loginItemSupported === true
  };
}
