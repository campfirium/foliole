import { expect, it } from 'vitest';

import { isDesktopUpdateApplicable } from './desktopUpdateAvailability.js';

it.each([
  ['macOS GitHub package', true, { isMas: false, isPackaged: true, isWindowsStore: false, platform: 'darwin' }],
  ['Windows GitHub package', true, { isMas: false, isPackaged: true, isWindowsStore: false, platform: 'win32' }],
  ['Mac App Store package', false, { isMas: true, isPackaged: true, isWindowsStore: false, platform: 'darwin' }],
  ['Microsoft Store package', false, { isMas: false, isPackaged: true, isWindowsStore: true, platform: 'win32' }],
  ['unpackaged Electron', false, { isMas: false, isPackaged: false, isWindowsStore: false, platform: 'darwin' }],
  ['Linux package', false, { isMas: false, isPackaged: true, isWindowsStore: false, platform: 'linux' }]
] as const)('%s applicability is %s', (_label, expected, input) => {
  expect(isDesktopUpdateApplicable(input)).toBe(expected);
});
