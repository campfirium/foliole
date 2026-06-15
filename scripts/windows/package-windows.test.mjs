// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectBuiltArtifactState } from './package-built-artifacts.mjs';
import {
  collectInstallerArtifactPaths,
  createNativePackageSteps,
  createWslPackageSteps,
  formatBytes,
  readPackageVersion,
  resolveReleaseArtifactPaths,
  resolveInstallMode,
  resolveBuiltArtifactMode,
  resolvePackageStatusLabel,
  resolvePackagedInstallerPath,
  resolvePackageMode
} from './package-windows.mjs';

describe('windows package runner', () => {
  it('uses native mode on Windows or when explicitly requested', () => {
    expect(resolvePackageMode(['node', 'script'], 'win32')).toBe('native');
    expect(resolvePackageMode(['node', 'script', '--native'], 'linux')).toBe('native');
    expect(resolvePackageMode(['node', 'script'], 'linux')).toBe('wsl');
  });

  it('only installs when explicitly requested', () => {
    expect(resolveInstallMode(['node', 'script'])).toBe(false);
    expect(resolveInstallMode(['node', 'script', '--install'])).toBe(true);
  });

  it('only reuses built artifacts when explicitly requested', () => {
    expect(resolveBuiltArtifactMode(['node', 'script'])).toBe(false);
    expect(resolveBuiltArtifactMode(['node', 'script', '--from-built'])).toBe(true);
  });

  it('reports installed status only after the install path is requested', () => {
    expect(resolvePackageStatusLabel(false)).toBe('PACKAGED');
    expect(resolvePackageStatusLabel(true)).toBe('PACKAGED_AND_INSTALLED');
  });

  it('runs the native package pipeline through npm and electron-builder', () => {
    const steps = createNativePackageSteps();

    expect(steps.map((step) => step.label)).toEqual([
      'renderer build',
      'electron compile',
      'electron-builder nsis'
    ]);
    expect(steps[2]).toMatchObject({
      args: [
        '/d',
        '/s',
        '/c',
        'npm exec -- electron-builder --config electron/builder.json --win nsis --publish never'
      ],
      command: 'cmd.exe'
    });
  });

  it('can run the native package pipeline from existing build artifacts', () => {
    const steps = createNativePackageSteps(true);

    expect(steps.map((step) => step.label)).toEqual(['electron-builder nsis']);
  });

  it('syncs the Windows checkout before delegating to native packaging from WSL', () => {
    const steps = createWslPackageSteps('/repo');

    expect(steps[0]).toMatchObject({
      args: ['scripts/windows/windows-sync.sh'],
      command: 'bash',
      cwd: '/repo',
      env: {
        WINDOWS_SYNC_FORCE_FULL: '1',
        WINDOWS_SYNC_INCLUDE_ELECTRON_DIST: '1'
      }
    });
    expect(steps[1].command).toBe('cmd.exe');
    expect(steps[1].cwd).toBe('/mnt/c/Windows/System32');
    expect(steps[1].args.join(' ')).toContain('npm run windows:package:native');
    expect(steps[1].args.join(' ')).toContain('D:\\C\\foliole');
  });

  it('passes the install flag through to the Windows-native package runner', () => {
    const steps = createWslPackageSteps('/repo', true);

    expect(steps[1].args.join(' ')).toContain('npm run windows:package:native -- --install');
  });

  it('checks built artifacts before delegating WSL from-built packaging', () => {
    const steps = createWslPackageSteps('/repo', false, true);

    expect(steps[0]).toMatchObject({
      args: ['scripts/windows/package-built-artifacts.mjs'],
      command: 'node',
      cwd: '/repo'
    });
    expect(steps[1].env).toMatchObject({
      WINDOWS_SYNC_INCLUDE_DIST: '1',
      WINDOWS_SYNC_INCLUDE_ELECTRON_DIST: '1'
    });
    expect(steps[2].args.join(' ')).toContain('--from-built --skip-built-artifact-check');
  });

  it('formats artifact sizes as whole megabytes', () => {
    expect(formatBytes(161578306)).toBe('154MB');
  });

  it('cleans only known release artifacts before native packaging', () => {
    const root = 'D:\\repo';
    expect(resolveReleaseArtifactPaths(root, '9.8.7')).toEqual([
      join(root, 'release-artifacts/win-unpacked'),
      join(root, 'release-artifacts/win-unpacked.tmp'),
      join(root, 'release-artifacts/Foliole Setup 9.8.7.exe'),
      join(root, 'release-artifacts/Foliole Setup 9.8.7.exe.blockmap'),
      join(root, 'release-artifacts/latest.yml'),
      join(root, 'release-artifacts/builder-debug.yml')
    ]);
  });

  it('finds the current electron-builder Windows installer artifact', () => {
    const root = mkdtempSync(join(tmpdir(), 'foliole-package-test-'));
    try {
      mkdirSync(join(root, 'release-artifacts'));
      writeFileSync(join(root, 'release-artifacts', 'Foliole-Setup-9.8.7-win-x64.exe'), '');
      writeFileSync(join(root, 'release-artifacts', 'Foliole-Setup-9.8.7-win-x64.exe.blockmap'), '');
      writeFileSync(join(root, 'release-artifacts', 'Other-Setup-9.8.7-win-x64.exe'), '');

      expect(collectInstallerArtifactPaths(root, '9.8.7')).toEqual([
        join(root, 'release-artifacts', 'Foliole-Setup-9.8.7-win-x64.exe')
      ]);
      expect(resolvePackagedInstallerPath(root, '9.8.7')).toBe(
        join(root, 'release-artifacts', 'Foliole-Setup-9.8.7-win-x64.exe')
      );
      expect(resolveReleaseArtifactPaths(root, '9.8.7')).toContain(
        join(root, 'release-artifacts', 'Foliole-Setup-9.8.7-win-x64.exe.blockmap')
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('reads the package version used by release artifact names', () => {
    expect(readPackageVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('reports missing built artifacts for from-built packaging', () => {
    const root = mkdtempSync(join(tmpdir(), 'foliole-built-artifacts-test-'));
    try {
      expect(collectBuiltArtifactState(root).missing).toEqual([
        join(root, 'dist/index.html'),
        join(root, 'electron-dist/electron/main.js'),
        join(root, 'electron-dist/electron/preload.cjs')
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
