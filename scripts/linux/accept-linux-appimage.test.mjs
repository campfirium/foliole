// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { assertLinuxAcceptanceEnvironment } from './accept-linux-appimage.mjs';

describe('Linux AppImage acceptance environment', () => {
  it('rejects extraction and sandbox bypasses', () => {
    expect(() => assertLinuxAcceptanceEnvironment({})).not.toThrow();
    expect(() => assertLinuxAcceptanceEnvironment({ APPIMAGE_EXTRACT_AND_RUN: '1' }))
      .toThrow('APPIMAGE_EXTRACT_AND_RUN');
    expect(() => assertLinuxAcceptanceEnvironment({ FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG: '1' }))
      .toThrow('FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG');
  });
});
