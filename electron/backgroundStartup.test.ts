// @vitest-environment node

import { expect, it } from 'vitest';

import {
  BACKGROUND_UPDATE_REOPEN_ARG,
  shouldShowInitialWindow,
  wasOpenedForBackgroundUpdate
} from './backgroundStartup.js';

it('recognizes only the macOS Internal background-update relaunch', () => {
  expect(wasOpenedForBackgroundUpdate(['Foliole', BACKGROUND_UPDATE_REOPEN_ARG], 'darwin')).toBe(true);
  expect(wasOpenedForBackgroundUpdate(['Foliole'], 'darwin')).toBe(false);
  expect(wasOpenedForBackgroundUpdate(['Foliole', BACKGROUND_UPDATE_REOPEN_ARG], 'win32')).toBe(false);
});

it('keeps every background startup path from presenting the initial window', () => {
  expect(shouldShowInitialWindow({
    argv: ['Foliole', BACKGROUND_UPDATE_REOPEN_ARG],
    capturePanelLaunchIntent: false,
    openedAtLogin: false,
    platform: 'darwin'
  })).toBe(false);
  expect(shouldShowInitialWindow({
    argv: ['Foliole'], capturePanelLaunchIntent: false, openedAtLogin: false, platform: 'darwin'
  })).toBe(true);
});
