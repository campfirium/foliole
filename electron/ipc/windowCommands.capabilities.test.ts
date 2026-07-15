// @vitest-environment node
import { expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: {},
  dialog: {},
  shell: {}
}));

import { getDesktopHostCapabilities } from './windowCommands.js';

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
    loginItemSupported: false
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
