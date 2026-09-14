import { expect, it } from 'vitest';

import { normalizeDesktopHostName, resolveDesktopPlatformLabel } from './companionLanPayloads.js';

it('uses the host name without exposing the local-network suffix', () => {
  expect(normalizeDesktopHostName('Maci.local')).toBe('Maci');
  expect(normalizeDesktopHostName('ZEPHU-PC')).toBe('ZEPHU-PC');
});

it('uses a product name for the current Windows release', () => {
  expect(resolveDesktopPlatformLabel('win32', '10.0.26100')).toBe('Windows 11');
  expect(resolveDesktopPlatformLabel('win32', '10.0.19045')).toBe('Windows');
  expect(resolveDesktopPlatformLabel('darwin', '25.0.0')).toBe('macOS');
});
