import { afterEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../lib/platform/nativeContract';

import { loadDesktopHostCapabilities } from './desktopHostCapabilities';
import type { ElectronAPI } from './electronApi';

afterEach(() => {
  delete window.electronAPI;
});

it('parses the global capture shortcut runtime state', async () => {
  window.electronAPI = {
    invoke: vi.fn(async () => ({
      globalCapturePermission: 'granted',
      globalCaptureShortcutLabel: 'Command+Shift+C',
      globalCaptureShortcutRegistered: true,
      globalCaptureSupported: true,
      globalCaptureToastPositionSupported: true,
      loginItemSupported: false
    })) as unknown as NativeInvoke
  } as ElectronAPI;

  await expect(loadDesktopHostCapabilities()).resolves.toEqual({
    globalCapturePermission: 'granted',
    globalCaptureShortcutLabel: 'Command+Shift+C',
    globalCaptureShortcutRegistered: true,
    globalCaptureSupported: true,
    globalCaptureToastPositionSupported: true,
    loginItemSupported: false
  });
});

it('uses unsupported values when the desktop bridge is absent', async () => {
  await expect(loadDesktopHostCapabilities()).resolves.toEqual({
    globalCapturePermission: 'unavailable',
    globalCaptureShortcutLabel: null,
    globalCaptureShortcutRegistered: false,
    globalCaptureSupported: false,
    globalCaptureToastPositionSupported: false,
    loginItemSupported: false
  });
});
