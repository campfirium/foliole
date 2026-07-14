import { expect, it } from 'vitest';

import { usesNativeMacOSWindowControls } from './windowChrome';

it('selects native window controls only for macOS renderers', () => {
  expect(usesNativeMacOSWindowControls('MacIntel', 'Electron')).toBe(true);
  expect(usesNativeMacOSWindowControls('Win32', 'Electron')).toBe(false);
  expect(usesNativeMacOSWindowControls('Linux x86_64', 'Electron')).toBe(false);
});
