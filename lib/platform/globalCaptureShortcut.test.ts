import { expect, it } from 'vitest';

import {
  GLOBAL_CAPTURE_COMMAND_ID,
  resolveGlobalCaptureAccelerators
} from './globalCaptureShortcut.js';

it('uses platform defaults when no global capture override exists', () => {
  expect(resolveGlobalCaptureAccelerators({}, 'darwin')).toEqual(['Command+Alt+Shift+C']);
  expect(resolveGlobalCaptureAccelerators({}, 'win32')).toEqual(['Alt+Shift+C']);
  expect(resolveGlobalCaptureAccelerators({}, 'linux')).toEqual([]);
});

it('converts persisted unified hotkey labels into Electron accelerators', () => {
  const overrides = {
    [GLOBAL_CAPTURE_COMMAND_ID]: {
      primary: 'Cmd+Shift+X',
      secondary: 'Ctrl+Alt+F8'
    }
  };

  expect(resolveGlobalCaptureAccelerators(overrides, 'darwin')).toEqual([
    'Command+Shift+X',
    'Control+Alt+F8'
  ]);
});

it('rejects malformed persisted overrides and preserves the platform default', () => {
  expect(resolveGlobalCaptureAccelerators({
    [GLOBAL_CAPTURE_COMMAND_ID]: { primary: 'Cmd+Shift+Not a key' }
  }, 'darwin')).toEqual(['Command+Alt+Shift+C']);
});
