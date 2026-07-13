// @vitest-environment node
import { expect, it } from 'vitest';

import { createMasBuilderConfig, readProvisioningProfileMetadata } from './package-mas.mjs';

it('creates an arm64 MAS config with the official bundle id and signed bundled Codex helper', () => {
  const config = createMasBuilderConfig({
    directories: { output: 'artifacts/windows' },
    electronDist: 'node_modules/electron/dist',
    extraResources: [{ from: 'base', to: 'base' }],
    mac: { category: 'public.app-category.education', target: ['dmg'] }
  }, {
    codexPath: '.tmp/macos/codex/0.144.3/codex',
    mode: 'development',
    provisioningProfile: '/profiles/development.provisionprofile'
  });

  expect(config.appId).toBe('com.campfirium.foliole');
  expect(config).not.toHaveProperty('electronDist');
  expect(config.directories.output).toBe('artifacts/macos');
  expect(config.mac.target).toEqual(['mas-dev']);
  expect(config.masDev).toMatchObject({
    binaries: ['Contents/MacOS/codex'],
    entitlements: 'build/entitlements.mas.plist',
    entitlementsInherit: 'build/entitlements.mas.inherit.plist',
    hardenedRuntime: true,
    provisioningProfile: '/profiles/development.provisionprofile',
    sign: 'scripts/macos/sign-mas-app.mjs'
  });
  expect(config.extraFiles).toContainEqual({
    from: '.tmp/macos/codex/0.144.3/codex',
    to: 'MacOS/codex'
  });
  expect(config.extraResources).not.toContainEqual(expect.objectContaining({ to: 'codex/codex' }));
});

it('switches only the target and profile for the distribution package', () => {
  const config = createMasBuilderConfig({ extraResources: [], mac: {} }, {
    codexPath: '.tmp/codex',
    mode: 'distribution',
    provisioningProfile: '/profiles/distribution.provisionprofile'
  });

  expect(config.mac.target).toEqual(['mas']);
  expect(config.mas.provisioningProfile).toBe('/profiles/distribution.provisionprofile');
});

it('skips provisioning files that Xcode cannot decode', () => {
  const run = () => {
    throw new Error('problem decoding');
  };

  expect(readProvisioningProfileMetadata('/profiles/invalid.provisionprofile', run)).toBeNull();
});

it('uses OpenSSL when the macOS security decoder rejects a valid profile', () => {
  const run = (command, args) => {
    if (command === 'security') throw new Error('problem decoding');
    if (command === 'openssl') return Buffer.from('<plist/>');
    return args.includes('Name') ? 'Foliole Development\n' : '2026-07-13T00:00:00Z\n';
  };

  expect(readProvisioningProfileMetadata('/profiles/development.provisionprofile', run)).toEqual({
    createdAt: '2026-07-13T00:00:00Z',
    name: 'Foliole Development'
  });
});
