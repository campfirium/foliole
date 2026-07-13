// @vitest-environment node

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createNativeHiddenDesktopBuildCommands,
  createNativeHiddenDesktopGateCommand,
  HIDDEN_MODE_HEALTH_SPECS
} from '../desktop/playwright-desktop-native-hidden.mjs';

describe('playwright desktop native hidden runner', () => {
  it('runs Playwright through the preview resource gate from the Windows checkout', () => {
    const command = createNativeHiddenDesktopGateCommand({
      argv: ['tests/desktop/startup.spec.ts', '--project=chromium'],
      cwd: 'D:\\C\\foliole',
      env: {},
      nodeBin: 'C:\\Node\\node.exe',
      platform: 'win32'
    });

    expect(command).toMatchObject({
      args: [
        'scripts/with-resource-gate.mjs',
        'preview',
        '--',
        'C:\\Node\\node.exe',
        'node_modules/playwright/cli.js',
        'test',
        '--config',
        'playwright.desktop.config.ts',
        'tests/desktop/startup.spec.ts',
        '--project=chromium'
      ],
      bin: 'C:\\Node\\node.exe',
      cwd: path.resolve('D:\\C\\foliole'),
      env: {
        FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG: '1',
        FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
        FOLIOLE_ELECTRON_APP_ROOT: path.resolve('D:\\C\\foliole'),
        FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1',
        FOLIOLE_DESKTOP_ACCEPTANCE_EVIDENCE: '1',
        FOLIOLE_WINDOWS_WORKDIR: path.resolve('D:\\C\\foliole')
      }
    });
  });

  it('defaults to hidden mode health when no spec is provided', () => {
    const command = createNativeHiddenDesktopGateCommand({
      cwd: 'D:\\C\\foliole',
      env: {},
      nodeBin: 'node',
      platform: 'win32'
    });

    expect(command.args.slice(-HIDDEN_MODE_HEALTH_SPECS.length)).toEqual(HIDDEN_MODE_HEALTH_SPECS);
  });

  it('preserves explicit app root and Windows workdir overrides', () => {
    const command = createNativeHiddenDesktopGateCommand({
      cwd: 'D:\\C\\foliole',
      env: {
        FOLIOLE_ELECTRON_APP_ROOT: 'D:\\Alt\\foliole',
        FOLIOLE_WINDOWS_WORKDIR: 'D:\\Alt\\foliole'
      },
      nodeBin: 'node',
      platform: 'win32'
    });

    expect(command.cwd).toBe(path.resolve('D:\\Alt\\foliole'));
    expect(command.env.FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG).toBe('1');
    expect(command.env.FOLIOLE_DISABLE_HARDWARE_ACCELERATION).toBe('1');
    expect(command.env.FOLIOLE_ELECTRON_APP_ROOT).toBe(path.resolve('D:\\Alt\\foliole'));
    expect(command.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN).toBe('1');
    expect(command.env.FOLIOLE_DESKTOP_ACCEPTANCE_EVIDENCE).toBe('1');
    expect(command.env.FOLIOLE_WINDOWS_WORKDIR).toBe(path.resolve('D:\\Alt\\foliole'));
  });

  it('builds renderer and Electron output unless explicitly skipped', () => {
    expect(createNativeHiddenDesktopBuildCommands({
      cwd: 'D:\\C\\foliole',
      env: {},
      npmBin: 'npm.cmd'
    })).toEqual([
      { args: ['run', 'build'], bin: 'npm.cmd', cwd: path.resolve('D:\\C\\foliole'), env: {} },
      { args: ['run', 'electron:compile'], bin: 'npm.cmd', cwd: path.resolve('D:\\C\\foliole'), env: {} }
    ]);

    expect(createNativeHiddenDesktopBuildCommands({
      cwd: 'D:\\C\\foliole',
      env: { FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1' },
      npmBin: 'npm.cmd'
    })).toEqual([]);
  });
});
