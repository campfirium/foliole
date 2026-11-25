import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { isDesktopRuntime } from './runtime';
import { resolveRuntimeOperatingSystem } from './runtime/operatingSystem';
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

export async function openGlobalCaptureAccessibilitySettings() {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('global_capture_accessibility_settings_unavailable');
  await invoke(NATIVE_COMMANDS.openGlobalCaptureAccessibilitySettings);
}

export function isWorkspaceGlobalCaptureAvailable() {
  return isDesktopRuntime() && resolveRuntimeOperatingSystem() !== 'other';
}

export function openWorkspaceGlobalCapture() {
  return getRuntimeInvoke()?.(NATIVE_COMMANDS.openGlobalCapturePanel).catch(() => {
    // The native invoke reports the failure through the desktop diagnostics.
  });
}
