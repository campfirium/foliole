// @vitest-environment node
/* global Buffer, URL */
import { readFileSync } from 'node:fs';

import { expect, it, vi } from 'vitest';

import { cleanMasElectronOutput, createMasBuilderConfig, readProvisioningProfileMetadata } from './package-mas.mjs';

it('cleans stale Electron output before compiling a MAS package', async () => {
  const remove = vi.fn(async () => undefined);

  await cleanMasElectronOutput('/repo', remove);

  expect(remove).toHaveBeenCalledWith('/repo/dist/electron', { force: true, recursive: true });
});

it('allows the sandboxed MAS app to host the loopback Agent Control server', () => {
  const entitlements = readFileSync(new URL('../../build/entitlements.mas.plist', import.meta.url), 'utf8');

  expect(entitlements).toContain('<key>com.apple.security.network.client</key>');
  expect(entitlements).toContain('<key>com.apple.security.network.server</key>');
});

it('waits for the physical trigger modifiers to be released before posting Command-C', () => {
  const source = readFileSync(new URL('./native/FolioleGlobalCapture.m', import.meta.url), 'utf8');

  expect(source).toContain('kCGEventSourceStateHIDSystemState');
  expect(source).toContain('kVK_Command');
  expect(source).toContain('kVK_RightCommand');
  expect(source).toContain('kVK_Shift');
  expect(source).toContain('kVK_RightShift');
  expect(source).toContain('MODIFIER_RELEASE_ATTEMPTS = 20');
  expect(source).toContain('POLL_INTERVAL_US = 25000');
  expect(source).toContain('usleep(POLL_INTERVAL_US)');
  expect(source).toMatch(/if \(!wait_for_trigger_modifiers_release\(\)\)[\s\S]*if \(!post_command_c\(\)\)/);
});

it('creates an arm64 MAS config with the official bundle id and signed bundled Codex helper', () => {
  const config = createMasBuilderConfig({
    directories: { output: 'artifacts/windows' },
    electronDist: 'node_modules/electron/dist',
    extraResources: [{ from: 'base', to: 'base' }],
    mac: { category: 'public.app-category.education', target: ['dmg'] }
  }, {
    codexPath: '.tmp/macos/codex/0.144.3/codex',
    mode: 'development',
    globalCaptureHelperPath: '.tmp/macos/global-capture-helper/Foliole Global Capture',
    provisioningProfile: '/profiles/development.provisionprofile'
  });

  expect(config.appId).toBe('com.campfirium.foliole');
  expect(config).not.toHaveProperty('electronDist');
  expect(config.directories.output).toBe('artifacts/macos');
  expect(config.mac.target).toEqual(['mas-dev']);
  expect(config.masDev).toMatchObject({
    binaries: ['Contents/MacOS/codex', 'Contents/MacOS/Foliole Global Capture'],
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
  expect(config.extraFiles).toContainEqual({
    from: '.tmp/macos/global-capture-helper/Foliole Global Capture',
    to: 'MacOS/Foliole Global Capture'
  });
  expect(config.extraResources).not.toContainEqual(expect.objectContaining({ to: 'codex/codex' }));
});

it('preserves both macOS status Template images in the dynamic MAS config', () => {
  const base = JSON.parse(readFileSync(new URL('../../electron/builder.json', import.meta.url), 'utf8'));
  const config = createMasBuilderConfig(base, {
    codexPath: '.tmp/codex',
    mode: 'development',
    globalCaptureHelperPath: '.tmp/Foliole Global Capture',
    provisioningProfile: '/profiles/development.provisionprofile'
  });

  expect(config.extraResources).toEqual(expect.arrayContaining([
    { from: 'build/FolioleStatusTemplate.png', to: 'build/FolioleStatusTemplate.png' },
    { from: 'build/FolioleStatusTemplate@2x.png', to: 'build/FolioleStatusTemplate@2x.png' }
  ]));
});

it('switches only the target and profile for the distribution package', () => {
  const config = createMasBuilderConfig({ extraResources: [], mac: {} }, {
    codexPath: '.tmp/codex',
    mode: 'distribution',
    globalCaptureHelperPath: '.tmp/Foliole Global Capture',
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
