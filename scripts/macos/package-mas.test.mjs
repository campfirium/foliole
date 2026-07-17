// @vitest-environment node
/* global Buffer, URL */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  cleanMasElectronOutput,
  createMasArtifactName,
  createMasBuilderConfig,
  installMasDevelopmentApp,
  readProvisioningProfileMetadata,
  resolveInstallMode
} from './package-mas.mjs';

it('cleans stale Electron output before compiling a MAS package', async () => {
  const remove = vi.fn(async () => undefined);

  await cleanMasElectronOutput('/repo', remove);

  expect(remove).toHaveBeenCalledWith('/repo/dist/electron', { force: true, recursive: true });
});

it('routes the Internal update script through the MAS development package', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

  expect(packageJson.scripts['macos:internal:update']).toBe('node scripts/macos/package-mas.mjs --install');
  expect(resolveInstallMode(['node', 'script', '--install'])).toBe(true);
});

it('replaces an installed app without merging stale bundle files', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'foliole-macos-install-'));
  const sourcePath = path.join(root, 'source/Foliole.app');
  const targetPath = path.join(root, 'Applications/Foliole.app');
  mkdirSync(sourcePath, { recursive: true });
  mkdirSync(targetPath, { recursive: true });
  writeFileSync(path.join(sourcePath, 'current'), 'current');
  writeFileSync(path.join(targetPath, 'stale'), 'stale');
  const run = vi.fn((command, args) => {
    if (command === 'ditto') cpSync(args[0], args[1], { recursive: true });
    return { status: 0 };
  });
  const lifecycle = { isRunning: vi.fn(() => false), open: vi.fn(), quitAndWait: vi.fn() };

  await installMasDevelopmentApp({ lifecycle, log: vi.fn(), sourcePath, targetPath, run });

  expect(existsSync(path.join(targetPath, 'current'))).toBe(true);
  expect(existsSync(path.join(targetPath, 'stale'))).toBe(false);
  expect(run.mock.calls.map(([command]) => command)).toEqual(['ditto', 'codesign']);
  expect(lifecycle.open).toHaveBeenCalledOnce();
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
  expect(source).toContain('kVK_Control');
  expect(source).toContain('kVK_RightControl');
  expect(source).toContain('kVK_Option');
  expect(source).toContain('kVK_RightOption');
  expect(source).toContain('return command_down || shift_down || control_down || option_down;');
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
    electronDist: '.tmp/electron-mas-arm64',
    mode: 'development',
    globalCaptureHelperPath: '.tmp/macos/global-capture-helper/Foliole Global Capture',
    outputDirectory: '/private/tmp/foliole-mas-development-output',
    provisioningProfile: '/profiles/development.provisionprofile'
  });

  expect(config.appId).toBe('com.campfirium.foliole');
  expect(config.electronDist).toBe('.tmp/electron-mas-arm64');
  expect(config.directories.output).toBe('/private/tmp/foliole-mas-development-output');
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
    electronDist: '.tmp/electron-mas-arm64',
    mode: 'development',
    globalCaptureHelperPath: '.tmp/Foliole Global Capture',
    outputDirectory: '/private/tmp/foliole-mas-development-output',
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
    electronDist: '.tmp/electron-mas-arm64',
    mode: 'distribution',
    globalCaptureHelperPath: '.tmp/Foliole Global Capture',
    outputDirectory: '/private/tmp/foliole-mas-distribution-output',
    provisioningProfile: '/profiles/distribution.provisionprofile'
  });

  expect(config.mac.target).toEqual(['mas']);
  expect(config.mas.provisioningProfile).toBe('/profiles/distribution.provisionprofile');
  expect(createMasArtifactName('Foliole', '0.6.5')).toBe('Foliole-0.6.5-mac-arm64.pkg');
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
