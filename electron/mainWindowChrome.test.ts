// @vitest-environment node

import { expect, it } from 'vitest';

import {
  createMainWindowChromeOptions,
  MACOS_TRAFFIC_LIGHT_POSITION
} from './mainWindowChrome.js';

it('uses native traffic lights for the macOS main window', () => {
  expect(MACOS_TRAFFIC_LIGHT_POSITION).toEqual({ x: 52, y: 12 });
  expect(createMainWindowChromeOptions('darwin')).toEqual({
    titleBarStyle: 'hidden',
    trafficLightPosition: MACOS_TRAFFIC_LIGHT_POSITION
  });
});

it('keeps the existing frameless chrome on Windows and Linux', () => {
  expect(createMainWindowChromeOptions('win32')).toEqual({ frame: false });
  expect(createMainWindowChromeOptions('linux')).toEqual({ frame: false });
});
