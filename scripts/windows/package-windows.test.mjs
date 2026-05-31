// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createNativePackageSteps,
  createWslPackageSteps,
  formatBytes,
  readPackageVersion,
  resolveReleaseArtifactPaths,
  resolvePackageMode
} from './package-windows.mjs';

describe('windows package runner', () => {
  it('uses native mode on Windows or when explicitly requested', () => {
    expect(resolvePackageMode(['node', 'script'], 'win32')).toBe('native');
    expect(resolvePackageMode(['node', 'script', '--native'], 'linux')).toBe('native');
    expect(resolvePackageMode(['node', 'script'], 'linux')).toBe('wsl');
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
        'npm exec -- electron-builder --config electron/builder.json --win nsis'
      ],
      command: 'cmd.exe'
    });
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

  it('formats artifact sizes as whole megabytes', () => {
    expect(formatBytes(161578306)).toBe('154MB');
  });

  it('cleans only known release artifacts before native packaging', () => {
    expect(resolveReleaseArtifactPaths('/repo', '9.8.7')).toEqual([
      '/repo/release/win-unpacked',
      '/repo/release/Foliole Setup 9.8.7.exe',
      '/repo/release/Foliole Setup 9.8.7.exe.blockmap',
      '/repo/release/latest.yml',
      '/repo/release/builder-debug.yml'
    ]);
  });

  it('reads the package version used by release artifact names', () => {
    expect(readPackageVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
