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
  expect(getDesktopHostCapabilities('darwin', true)).toEqual({
    globalCaptureSupported: false,
    loginItemSupported: false
  });
  expect(getDesktopHostCapabilities('win32', false)).toEqual({
    globalCaptureSupported: true,
    loginItemSupported: false
  });
  expect(getDesktopHostCapabilities('win32', true)).toEqual({
    globalCaptureSupported: true,
    loginItemSupported: true
  });
});
