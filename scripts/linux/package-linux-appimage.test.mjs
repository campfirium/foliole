// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { resolveDesktopLaunchTarget } from '../desktop/playwright-desktop-launch-target.mjs';
import { assertLinuxBuildHost } from './package-linux-appimage.mjs';

describe('Linux AppImage package host', () => {
  it('accepts only the Ubuntu release architecture', () => {
    expect(() => assertLinuxBuildHost('linux', 'x64')).not.toThrow();
    expect(() => assertLinuxBuildHost('linux', 'arm64')).toThrow('Linux x64');
    expect(() => assertLinuxBuildHost('darwin', 'x64')).toThrow('Linux x64');
  });

  it('keeps an installed AppImage rooted in its POSIX directory', () => {
    const target = resolveDesktopLaunchTarget('/repo', () => true, {
      FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: '/repo/artifacts/linux/Foliole.AppImage',
      FOLIOLE_ELECTRON_LAUNCH_MODE: 'installed'
    });
    expect(target.appRoot).toBe('/repo/artifacts/linux');
    expect(target.executablePath).toBe('/repo/artifacts/linux/Foliole.AppImage');
    expect(target.launchMode).toBe('installed');
  });
});
