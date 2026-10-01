// @vitest-environment node

import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { resolveDesktopLaunchTarget } from '../desktop/playwright-desktop-launch-target.mjs';
import { assertLinuxBuildHost, createLinuxBuilderConfig } from './package-linux-deb.mjs';

it('accepts only the Ubuntu release architecture', () => {
  expect(() => assertLinuxBuildHost('linux', 'x64')).not.toThrow();
  expect(() => assertLinuxBuildHost('linux', 'arm64')).toThrow('Linux x64');
  expect(() => assertLinuxBuildHost('darwin', 'x64')).toThrow('Linux x64');
});

it('separates DEB and AppImage builds and guards the AppImage launcher', () => {
  const config = createLinuxBuilderConfig({
    directories: { output: 'artifacts/windows' },
    extraFiles: [{ from: 'build/cli', to: 'bin' }],
    linux: { target: ['AppImage'] },
    publish: [{ provider: 'github' }]
  });

  expect(config.publish).toBeNull();
  expect(config.linux.target).toEqual(['deb']);
  expect(config.extraFiles).toEqual([{ from: 'build/linux/foliole', to: 'bin/foliole' }]);
  const appImage = createLinuxBuilderConfig({ directories: {}, linux: {}, appImage: {} }, 'AppImage');
  expect(appImage.linux.target).toEqual(['AppImage']);
  expect(appImage.appImage.executableArgs).toEqual([]);
  expect(appImage.afterPack).toBe('scripts/linux/appimage-after-pack.mjs');
  expect(appImage.extraFiles).toEqual([]);
});

it('declares installable Electron and mDNS dependencies instead of a default sentinel', () => {
  const { deb } = JSON.parse(readFileSync('electron/builder.json', 'utf8'));
  expect(deb.depends).not.toContain('default');
  expect(deb.depends).toEqual(expect.arrayContaining([
    'libgtk-3-0', 'libnss3', 'libsecret-1-0',
    'libavahi-client3', 'libavahi-common3', 'avahi-daemon'
  ]));
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
