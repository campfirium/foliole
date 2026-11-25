// @vitest-environment node
import { shell } from 'electron';
import { expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import { getDesktopHostCapabilities, handleWindowAndUtilityCommand } from './windowCommands.js';

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: {},
  dialog: {},
  shell: { openExternal: vi.fn(async () => undefined) }
}));

it('reports desktop capabilities by host and packaging state', () => {
  expect(getDesktopHostCapabilities('darwin', true, {
    globalCaptureShortcutLabel: 'Command+Shift+C',
    globalCaptureShortcutRegistered: true
  }, 'granted')).toEqual({
    globalCapturePermission: 'granted',
    globalCaptureShortcutLabel: 'Command+Shift+C',
    globalCaptureShortcutRegistered: true,
    globalCaptureSupported: true,
    globalCaptureToastPositionSupported: true,
    loginItemSupported: true
  });
  expect(getDesktopHostCapabilities('win32', false, {
    globalCaptureShortcutLabel: 'Alt+Shift+C',
    globalCaptureShortcutRegistered: false
  })).toEqual({
    globalCapturePermission: 'notRequired',
    globalCaptureShortcutLabel: 'Alt+Shift+C',
    globalCaptureShortcutRegistered: false,
    globalCaptureSupported: true,
    globalCaptureToastPositionSupported: false,
    loginItemSupported: false
  });
  expect(getDesktopHostCapabilities('win32', true, {
    globalCaptureShortcutLabel: 'Alt+Shift+C',
    globalCaptureShortcutRegistered: true
  })).toEqual({
    globalCapturePermission: 'notRequired',
    globalCaptureShortcutLabel: 'Alt+Shift+C',
    globalCaptureShortcutRegistered: true,
    globalCaptureSupported: true,
    globalCaptureToastPositionSupported: false,
    loginItemSupported: true
  });
});

it('opens only the fixed Accessibility settings pane on macOS', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const request = { command: NATIVE_COMMANDS.openGlobalCaptureAccessibilitySettings };
  try {
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    await expect(handleWindowAndUtilityCommand(request)).rejects.toThrow('unavailable');
    expect(shell.openExternal).not.toHaveBeenCalled();

    Object.defineProperty(process, 'platform', { ...platform, value: 'darwin' });
    await expect(handleWindowAndUtilityCommand(request)).resolves.toBeNull();
    expect(shell.openExternal).toHaveBeenCalledExactlyOnceWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
    );
  } finally {
    Object.defineProperty(process, 'platform', platform);
  }
});
