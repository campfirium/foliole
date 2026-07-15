import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';

export interface DesktopHostCapabilities {
  globalCapturePermission: 'denied' | 'granted' | 'notRequired' | 'unavailable';
  globalCaptureShortcutLabel: string | null;
  globalCaptureShortcutRegistered: boolean;
  globalCaptureSupported: boolean;
  globalCaptureToastPositionSupported: boolean;
  loginItemSupported: boolean;
}

const unsupportedCapabilities: DesktopHostCapabilities = {
  globalCapturePermission: 'unavailable',
  globalCaptureShortcutLabel: null,
  globalCaptureShortcutRegistered: false,
  globalCaptureSupported: false,
  globalCaptureToastPositionSupported: false,
  loginItemSupported: false
};

export async function loadDesktopHostCapabilities(): Promise<DesktopHostCapabilities> {
  const invoke = getRuntimeInvoke();
  if (!invoke) return unsupportedCapabilities;
  const value = await invoke(NATIVE_COMMANDS.loadDesktopHostCapabilities);
  return {
    globalCapturePermission: ['denied', 'granted', 'notRequired', 'unavailable'].includes(value?.globalCapturePermission)
      ? value.globalCapturePermission
      : 'unavailable',
    globalCaptureShortcutLabel: typeof value?.globalCaptureShortcutLabel === 'string'
      ? value.globalCaptureShortcutLabel
      : null,
    globalCaptureShortcutRegistered: value?.globalCaptureShortcutRegistered === true,
    globalCaptureSupported: value?.globalCaptureSupported === true,
    globalCaptureToastPositionSupported: value?.globalCaptureToastPositionSupported === true,
    loginItemSupported: value?.loginItemSupported === true
  };
}
