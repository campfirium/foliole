// @vitest-environment node
/* global process */

import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectBuiltArtifactState } from './package-built-artifacts.mjs';
import {
  INTERNAL_APP_ID,
  INTERNAL_OUTPUT_DIR,
  INTERNAL_PRODUCT_NAME,
  createInternalBuilderConfig,
  formatInternalBuildVersion
} from './package-windows-internal-config.mjs';
import {
  collectInstallerArtifactPaths,
  createCurrentUserInstallArgs,
  createNativePackageSteps,
  formatBytes,
  readPackageVersion,
  resolveReleaseArtifactPaths,
  resolveInstallMode,
  resolveInternalMode,
  resolveBuiltArtifactMode,
  resolvePackageStatusLabel,
  resolvePackagedInstallerPath,
  resolvePackageMode
} from './package-windows.mjs';

describe('windows package runner', () => {
  it('only supports packaging from a Windows checkout', () => {
    expect(resolvePackageMode('win32')).toBe('native');
    expect(resolvePackageMode('darwin')).toBe('unsupported');
    expect(resolvePackageMode('linux')).toBe('unsupported');
  });

  it('only installs when explicitly requested', () => {
    const previousInstallFlag = process.env.npm_config_install;
    try {
      delete process.env.npm_config_install;
      expect(resolveInstallMode(['node', 'script'])).toBe(false);
      expect(resolveInstallMode(['node', 'script', '--install'])).toBe(true);
      process.env.npm_config_install = 'true';
      expect(resolveInstallMode(['node', 'script'])).toBe(true);
    } finally {
      if (previousInstallFlag === undefined) {
        delete process.env.npm_config_install;
      } else {
        process.env.npm_config_install = previousInstallFlag;
      }
    }
  });

  it('uses the internal package channel only when explicitly requested', () => {
    expect(resolveInternalMode(['node', 'script'])).toBe(false);
    expect(resolveInternalMode(['node', 'script', '--internal'])).toBe(true);
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

  it('installs explicitly in the current-user context', () => {
    expect(createCurrentUserInstallArgs()).toEqual(['/currentuser', '/S']);
  });

  it('uses a generated electron-builder config for native internal packages', () => {
    const steps = createNativePackageSteps(true, true);

    expect(steps[0].args.join(' ')).toContain('--config .tmp/electron-builder-internal.json');
  });

  it('formats artifact sizes as whole megabytes', () => {
    expect(formatBytes(161578306)).toBe('154MB');
  });

  it('cleans only known release artifacts before native packaging', () => {
    const root = mkdtempSync(join(tmpdir(), 'foliole-package-clean-test-'));
    try {
      expect(resolveReleaseArtifactPaths(root, '9.8.7')).toEqual([
        join(root, 'artifacts/windows/win-unpacked'),
        join(root, 'artifacts/windows/win-unpacked.tmp'),
        join(root, 'artifacts/windows/Foliole Setup 9.8.7.exe'),
        join(root, 'artifacts/windows/Foliole Setup 9.8.7.exe.blockmap'),
        join(root, 'artifacts/windows/latest.yml'),
        join(root, 'artifacts/windows/builder-debug.yml')
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('finds the current electron-builder Windows installer artifact', () => {
    const root = mkdtempSync(join(tmpdir(), 'foliole-package-test-'));
    try {
      mkdirSync(join(root, 'artifacts/windows'), { recursive: true });
      writeFileSync(join(root, 'artifacts/windows', 'Foliole-Setup-9.8.7-win-x64.exe'), '');
      writeFileSync(join(root, 'artifacts/windows', 'Foliole-Setup-9.8.7-win-x64.exe.blockmap'), '');
      writeFileSync(join(root, 'artifacts/windows', 'Other-Setup-9.8.7-win-x64.exe'), '');

      expect(collectInstallerArtifactPaths(root, '9.8.7')).toEqual([
        join(root, 'artifacts/windows', 'Foliole-Setup-9.8.7-win-x64.exe')
      ]);
      expect(resolvePackagedInstallerPath(root, '9.8.7')).toBe(
        join(root, 'artifacts/windows', 'Foliole-Setup-9.8.7-win-x64.exe')
      );
      expect(resolveReleaseArtifactPaths(root, '9.8.7')).toContain(
        join(root, 'artifacts/windows', 'Foliole-Setup-9.8.7-win-x64.exe.blockmap')
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
        join(root, 'dist/desktop/index.html'),
        join(root, 'dist/electron/main.js'),
        join(root, 'electron/preload.cjs')
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('finds internal installer artifacts in the internal output directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'foliole-package-test-'));
    try {
      mkdirSync(join(root, INTERNAL_OUTPUT_DIR), { recursive: true });
      writeFileSync(join(root, INTERNAL_OUTPUT_DIR, 'Foliole Internal-Setup-9.8.7-internal.20260630120000-internal-win-x64.exe'), '');

      expect(collectInstallerArtifactPaths(root, '9.8.7-internal.20260630120000', INTERNAL_OUTPUT_DIR)).toEqual([
        join(root, INTERNAL_OUTPUT_DIR, 'Foliole Internal-Setup-9.8.7-internal.20260630120000-internal-win-x64.exe')
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('creates an internal builder config with separate install identity and internal version metadata', () => {
    const internalVersion = formatInternalBuildVersion('9.8.7', new Date('2026-06-30T12:00:00Z'));
    const config = createInternalBuilderConfig({
      appId: 'com.foliole.desktop',
      directories: { output: 'artifacts/windows' },
      nsis: { shortcutName: 'Foliole' },
      productName: 'Foliole',
      win: { artifactName: '${productName}-Setup-${version}-win-${arch}.${ext}' }
    }, internalVersion);

    expect(internalVersion).toBe('9.8.7-internal.20260630120000');
    expect(config.appId).toBe(INTERNAL_APP_ID);
    expect(config.productName).toBe(INTERNAL_PRODUCT_NAME);
    expect(config.directories.output).toBe(INTERNAL_OUTPUT_DIR);
    expect(config.directories.buildResources).toBe('.tmp/windows-internal-build-resources');
    expect(config.extraMetadata).toMatchObject({
      folioleBuildChannel: 'internal',
      name: 'foliole-internal',
      productName: INTERNAL_PRODUCT_NAME,
      version: internalVersion
    });
    expect(config.nsis.shortcutName).toBe(INTERNAL_PRODUCT_NAME);
    expect(config.win.artifactName).toContain('internal-win');
  });

  it('does not treat source preload mtime as generated build freshness', () => {
    const root = mkdtempSync(join(tmpdir(), 'foliole-built-artifacts-test-'));
    try {
      const oldDate = new Date('2026-01-01T00:00:00Z');
      const currentDate = new Date('2026-01-02T00:00:00Z');
      mkdirSync(join(root, 'dist/desktop'), { recursive: true });
      mkdirSync(join(root, 'dist/electron'), { recursive: true });
      mkdirSync(join(root, 'electron'), { recursive: true });
      writeFileSync(join(root, 'package.json'), '{}');
      writeFileSync(join(root, 'dist/desktop/index.html'), '');
      writeFileSync(join(root, 'dist/electron/main.js'), '');
      writeFileSync(join(root, 'electron/preload.cjs'), '');
      utimesSync(join(root, 'package.json'), oldDate, oldDate);
      utimesSync(join(root, 'electron/preload.cjs'), oldDate, oldDate);
      utimesSync(join(root, 'dist/desktop/index.html'), currentDate, currentDate);
      utimesSync(join(root, 'dist/electron/main.js'), currentDate, currentDate);

      expect(collectBuiltArtifactState(root)).toMatchObject({
        missing: [],
        oldestArtifactMtimeMs: currentDate.getTime()
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
