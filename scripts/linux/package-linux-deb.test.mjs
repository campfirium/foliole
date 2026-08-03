// @vitest-environment node

import { expect, it } from 'vitest';

import { resolveDesktopLaunchTarget } from '../desktop/playwright-desktop-launch-target.mjs';
import { assertLinuxBuildHost, createLinuxBuilderConfig } from './package-linux-deb.mjs';

it('accepts only the Ubuntu release architecture', () => {
  expect(() => assertLinuxBuildHost('linux', 'x64')).not.toThrow();
  expect(() => assertLinuxBuildHost('linux', 'arm64')).toThrow('Linux x64');
  expect(() => assertLinuxBuildHost('darwin', 'x64')).toThrow('Linux x64');
});

it('disables builder publishing only in the Linux DEB build config', () => {
  const config = createLinuxBuilderConfig({
    directories: { output: 'artifacts/windows' },
    extraFiles: [{ from: 'build/cli', to: 'bin' }],
    linux: { target: ['AppImage'] },
    publish: [{ provider: 'github' }]
  });

  expect(config.publish).toBeNull();
  expect(config.linux.target).toEqual(['deb']);
  expect(config.extraFiles).toEqual([
    { from: 'build/linux/foliole', to: 'bin/foliole' },
    { from: 'build/linux/foliole-global-clip', to: 'bin/foliole-global-clip' }
  ]);
});

it('roots an installed Linux package at its POSIX directory', () => {
  const target = resolveDesktopLaunchTarget('/repo', () => true, {
    FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: '/opt/Foliole/foliole',
    FOLIOLE_ELECTRON_LAUNCH_MODE: 'installed'
  });
  expect(target.appRoot).toBe('/opt/Foliole');
  expect(target.executablePath).toBe('/opt/Foliole/foliole');
  expect(target.launchMode).toBe('installed');
});
