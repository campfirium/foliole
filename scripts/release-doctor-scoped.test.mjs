// @vitest-environment node

import { join } from 'node:path';
import { expect, it } from 'vitest';

import { collectReleaseDoctorChecks } from './release-doctor.mjs';
import {
  commandRunner, createFixture, findCheck, githubResponses,
  onlineDownloads, onlineReleaseFetcher, siteHome
} from './release-doctor.test-support.mjs';

it('accepts a scoped Release while unselected platform downloads remain on the bridge', async () => {
  const version = '0.9.0';
  const platformRegistry = {
    schemaVersion: 1,
    platforms: ['macos', 'windows'].map((id) => ({
      id, displayName: id === 'macos' ? 'macOS' : 'Windows', status: 'active',
      architectures: [id === 'macos' ? 'arm64' : 'x64'], deliveryChannel: 'github-release',
      t7Required: true, artifactContract: 'desktop-updater',
      managedAssets: [`Foliole-${id === 'macos' ? 'macOS-arm64' : 'Windows-x64'}-{version}.${id === 'macos' ? 'dmg' : 'exe'}`],
      update: { mode: 'electron-updater', baselineVersion: '0.7.2' }
    }))
  };
  const manifest = {
    desktopUpdater: { compatibilityBridgeVersion: '0.8.0' }, latest: version,
    releases: [
      { version: '0.8.0', platforms: ['macos', 'windows'] },
      { version, platforms: ['windows'], url: `https://github.com/campfirium/foliole/releases/tag/v${version}` }
    ]
  };
  const fixture = await createFixture({ manifest, platformRegistry });
  const downloads = onlineDownloads(version);
  downloads.platforms.macos = {
    architectures: ['arm64'], asset: 'Foliole-macOS-arm64-0.8.0.dmg', channel: 'github-release',
    releaseUrl: 'https://github.com/campfirium/foliole/releases/tag/v0.8.0', status: 'available',
    tag: 'v0.8.0', url: 'https://github.com/campfirium/foliole/releases/download/v0.8.0/Foliole-macOS-arm64-0.8.0.dmg',
    version: '0.8.0'
  };
  const result = await collectReleaseDoctorChecks({
    argv: ['--phase=post'], commandRunner: commandRunner(githubResponses(version, {}, version, downloads)),
    fetcher: onlineReleaseFetcher(version, manifest, downloads),
    marketingRoot: join(fixture.rootDir, 'missing'), rootDir: fixture.rootDir,
    siteFetcher: async () => siteHome(downloads)
  });
  expect(findCheck(result, 'GitHub latest release').status).toBe('PASS');
  expect(findCheck(result, 'Pages selected downloads').status).toBe('PASS');
  expect(findCheck(result, 'site download manifest').status).toBe('PASS');
});
