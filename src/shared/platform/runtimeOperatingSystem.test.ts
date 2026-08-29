import { expect, it } from 'vitest';

import { resolveRuntimeOperatingSystem, usesMacShortcutProjection } from './runtimeOperatingSystem';

it('detects the supported desktop operating systems from browser platform signals', () => {
  expect(resolveRuntimeOperatingSystem('macOS MacIntel')).toBe('macos');
  expect(resolveRuntimeOperatingSystem('Darwin arm64')).toBe('macos');
  expect(resolveRuntimeOperatingSystem('Windows Win32')).toBe('windows');
  expect(resolveRuntimeOperatingSystem('Linux x86_64')).toBe('other');
});

it('uses the macOS shortcut projection only for Apple desktop signals', () => {
  expect(usesMacShortcutProjection('MacIntel')).toBe(true);
  expect(usesMacShortcutProjection('Darwin')).toBe(true);
  expect(usesMacShortcutProjection('Win32')).toBe(false);
  expect(usesMacShortcutProjection('Linux x86_64')).toBe(false);
});
