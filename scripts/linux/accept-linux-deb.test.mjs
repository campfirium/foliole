// @vitest-environment node

import { expect, it } from 'vitest';

import { assertLinuxAcceptanceHost } from './accept-linux-deb.mjs';

it('accepts only the installed Ubuntu release architecture', () => {
  expect(() => assertLinuxAcceptanceHost('linux', 'x64')).not.toThrow();
  expect(() => assertLinuxAcceptanceHost('linux', 'arm64')).toThrow('Linux x64');
  expect(() => assertLinuxAcceptanceHost('darwin', 'x64')).toThrow('Linux x64');
});
