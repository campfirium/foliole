// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createMacosElectronDevCommand } from '../macos/electron-dev-preview.mjs';
import { createMacosNativePreflightCommands } from '../macos/macos-native-preflight.mjs';
import { resolveElectronDevInvocation } from '../run-electron-dev.mjs';
import { resolveElectronNativeHealthInvocation } from '../run-electron-native-health.mjs';

describe('desktop platform adapters', () => {
  it('keeps every desktop Sync Group discovery path on the OS DNS-SD adapter', async () => {
    const sources = await Promise.all([
      'electron/sync/companionMdnsAdvertisement.ts',
      'electron/sync/desktopSyncGroupAutoSync.ts',
      'electron/sync/desktopSyncGroupDiscovery.ts',
      'electron/sync/desktopSyncGroupDiscoverySession.ts'
    ].map((file) => readFile(file, 'utf8')));
    const combined = sources.join('\n');

    expect(combined).toContain("from './desktopDnsSd.js'");
    expect(combined).not.toMatch(/bonjour-service|multicast-dns|continuousMdnsQuery/u);
  });

  it('dispatches development and native health by host platform', () => {
    expect(resolveElectronDevInvocation('darwin', 'node').args)
      .toEqual(['scripts/macos/macos-electron-dev.mjs', 'start']);
    expect(resolveElectronDevInvocation('win32', 'node').args).toEqual(['scripts/electron-dev.mjs']);
    expect(resolveElectronDevInvocation('linux', 'node').args).toEqual(['scripts/electron-dev.mjs']);
    expect(resolveElectronNativeHealthInvocation('darwin', 'node').args).toEqual(['scripts/macos/macos-native-preflight.mjs']);
    expect(resolveElectronNativeHealthInvocation('win32', 'node').args).toEqual(['scripts/windows/electron-native-health-check.mjs']);
    expect(resolveElectronNativeHealthInvocation('linux', 'node').args).toEqual(['scripts/windows/electron-native-health-check.mjs']);
  });

  it('forwards an explicit library home through the platform development adapter', () => {
    const argv = ['--library-home', '/Users/tester/Documents/FolioleDemo'];
    expect(resolveElectronDevInvocation('darwin', 'node', argv).args).toEqual([
      'scripts/macos/macos-electron-dev.mjs', 'start', ...argv
    ]);
    expect(resolveElectronDevInvocation('win32', 'node', argv).args).toEqual([
      'scripts/electron-dev.mjs', ...argv
    ]);
  });

  it('forces the macOS development preview through one isolated resource-gated root', () => {
    const cwd = '/repo/foliole';
    const command = createMacosElectronDevCommand({
      cwd,
      env: { FOLIOLE_WINDOWS_WORKDIR: 'D:\\C\\foliole' },
      homeDir: '/Users/tester',
      nodeBin: 'node',
      platform: 'darwin'
    });
    const root = path.join(cwd, '.tmp', 'macos-desktop-reset-preview');

    expect(command.args).toEqual([
      'scripts/with-resource-gate.mjs', 'preview', '--',
      'node', 'scripts/electron-dev.mjs', '--preview-sandbox'
    ]);
    expect(command.env).toMatchObject({
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: root,
      FOLIOLE_LIBRARY_HOME: path.join(root, 'library'),
      FOLIOLE_PREVIEW_SANDBOX: '1',
      FOLIOLE_PREVIEW_SANDBOX_RESET: '1',
      FOLIOLE_PREVIEW_SANDBOX_ROOT: root,
      FOLIOLE_SESSION_DATA_PATH: path.join(root, 'session-data'),
      FOLIOLE_USER_DATA_PATH: path.join(root, 'user-data'),
      FOLIOLE_WORKDIR: root
    });
    expect(command.env.FOLIOLE_WINDOWS_WORKDIR).toBeUndefined();
  });

  it('keeps macOS native preflight compile-and-ABI-only and fails closed off Darwin', () => {
    const commands = createMacosNativePreflightCommands({
      cwd: '/repo/foliole', homeDir: '/Users/tester', nodeBin: 'node', platform: 'darwin'
    });
    expect(commands.map(({ args, bin }) => ({ args, bin }))).toEqual([
      { args: ['run', 'electron:rebuild:native'], bin: 'npm' },
      { args: ['run', 'macos:security-bookmarks:build'], bin: 'npm' },
      { args: ['run', 'electron:compile'], bin: 'npm' },
      { args: ['scripts/desktop/desktop-dnssd-native-probe.cjs'],
        bin: '/repo/foliole/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron' },
      { args: ['scripts/electron-sqlite-runner.mjs', '--preflight'], bin: 'node' }
    ]);
    expect(() => createMacosNativePreflightCommands({ platform: 'linux' })).toThrow('requires a darwin host');
  });

  it('does not emit the Windows workdir from shared macOS native gates', async () => {
    const { createNativeHiddenDesktopGateCommand } = await import('./playwright-desktop-native-hidden.mjs');
    const command = createNativeHiddenDesktopGateCommand({
      cwd: '/repo/foliole', env: { FOLIOLE_WINDOWS_WORKDIR: 'D:\\C\\foliole' }, nodeBin: 'node', platform: 'darwin'
    });
    expect(command.env.FOLIOLE_WINDOWS_WORKDIR).toBeUndefined();
    expect(command.env.FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG).toBeUndefined();
    expect(command.env.FOLIOLE_DISABLE_HARDWARE_ACCELERATION).toBeUndefined();
  });
});
