import { expect, it } from 'vitest';

import { isDesktopUpdateApplicable } from './desktopUpdateAvailability.js';

it.each([
  ['macOS GitHub package', true, { buildChannel: 'github', isPackaged: true, isWindowsStore: false, platform: 'darwin' }],
  ['Windows GitHub package', true, { buildChannel: 'github', isPackaged: true, isWindowsStore: false, platform: 'win32' }],
  ['Mac App Store package', false, { buildChannel: 'mas', isPackaged: true, isWindowsStore: false, platform: 'darwin' }],
  ['Microsoft Store package', false, { buildChannel: 'github', isPackaged: true, isWindowsStore: true, platform: 'win32' }],
  ['Internal package', false, { buildChannel: 'internal', isPackaged: true, isWindowsStore: false, platform: 'win32' }],
  ['unpackaged Electron', false, { buildChannel: 'github', isPackaged: false, isWindowsStore: false, platform: 'darwin' }],
  ['unidentified package', false, { buildChannel: null, isPackaged: true, isWindowsStore: false, platform: 'darwin' }],
  ['Linux package', false, { buildChannel: 'github', isPackaged: true, isWindowsStore: false, platform: 'linux' }]
] as const)('%s applicability is %s', (_label, expected, input) => {
  expect(isDesktopUpdateApplicable(input)).toBe(expected);
});
