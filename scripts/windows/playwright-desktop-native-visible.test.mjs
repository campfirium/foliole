// @vitest-environment node

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createNativeVisibleDesktopBuildCommands,
  createNativeVisibleDesktopGateCommand
} from './playwright-desktop-native-visible.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WINDOWS_WORKDIR = String.raw`D:\C\foliole`;
const WINDOWS_NODE = String.raw`C:\Node\node.exe`;

describe('playwright desktop native visible runner', () => {
  it('exposes a visible native desktop npm entry', async () => {
    const packageJson = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));

    expect(packageJson.scripts['test:e2e:desktop:native:visible']).toBe(
      'node scripts/windows/playwright-desktop-native-visible.mjs'
    );
  });

  it('requires explicit task specs instead of defaulting to a regression suite', () => {
    expect(() => createNativeVisibleDesktopGateCommand({
      argv: [],
      cwd: WINDOWS_WORKDIR,
      env: {},
      nodeBin: 'node'
    })).toThrow('requires at least one explicit Playwright spec');
  });

  it('runs Playwright through the preview resource gate in visible native mode', () => {
    const command = createNativeVisibleDesktopGateCommand({
      argv: ['tests/desktop/visible-native-presentation.spec.ts', '--project=chromium'],
      cwd: WINDOWS_WORKDIR,
      env: { FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1' },
      nodeBin: WINDOWS_NODE
    });

    expect(command).toMatchObject({
      args: [
        'scripts/with-resource-gate.mjs',
        'preview',
        '--',
        WINDOWS_NODE,
        'node_modules/playwright/cli.js',
        'test',
        '--config',
        'playwright.desktop.config.ts',
        'tests/desktop/visible-native-presentation.spec.ts',
        '--project=chromium'
      ],
      bin: WINDOWS_NODE,
      cwd: path.resolve(WINDOWS_WORKDIR),
      env: {
        FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG: '1',
        FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
        FOLIOLE_ELECTRON_APP_ROOT: path.resolve(WINDOWS_WORKDIR),
        FOLIOLE_ELECTRON_NATIVE_VISIBLE: '1',
        FOLIOLE_WINDOWS_WORKDIR: path.resolve(WINDOWS_WORKDIR)
      }
    });
    expect(command.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN).toBeUndefined();
  });

  it('builds renderer and Electron output unless explicitly skipped', () => {
    expect(createNativeVisibleDesktopBuildCommands({
      cwd: WINDOWS_WORKDIR,
      env: {},
      npmBin: 'npm.cmd'
    })).toEqual([
      { args: ['run', 'build'], bin: 'npm.cmd', cwd: path.resolve(WINDOWS_WORKDIR), env: {} },
      { args: ['run', 'electron:compile'], bin: 'npm.cmd', cwd: path.resolve(WINDOWS_WORKDIR), env: {} }
    ]);

    expect(createNativeVisibleDesktopBuildCommands({
      cwd: WINDOWS_WORKDIR,
      env: { FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD: '1' },
      npmBin: 'npm.cmd'
    })).toEqual([]);
  });
});
