// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  createMainWindowChromeOptions,
  MACOS_TRAFFIC_LIGHT_POSITION,
  setMainWindowNativeControlsVisible
} from './mainWindowChrome.js';

it('uses native traffic lights for the macOS main window', () => {
  expect(MACOS_TRAFFIC_LIGHT_POSITION).toEqual({ x: 60, y: 12 });
  expect(createMainWindowChromeOptions('darwin')).toEqual({
    titleBarStyle: 'hidden',
    trafficLightPosition: MACOS_TRAFFIC_LIGHT_POSITION
  });
});

it('keeps the existing frameless chrome on Windows and Linux', () => {
  expect(createMainWindowChromeOptions('win32')).toEqual({ frame: false });
  expect(createMainWindowChromeOptions('linux')).toEqual({ frame: false });
});

it('changes native control visibility only for macOS windows', () => {
  const window = { setWindowButtonVisibility: vi.fn() };

  setMainWindowNativeControlsVisible(window, false, 'darwin');
  setMainWindowNativeControlsVisible(window, true, 'win32');

  expect(window.setWindowButtonVisibility).toHaveBeenCalledTimes(1);
  expect(window.setWindowButtonVisibility).toHaveBeenCalledWith(false);
});
