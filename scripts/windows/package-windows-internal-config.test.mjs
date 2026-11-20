// @vitest-environment node

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  INTERNAL_APP_ID,
  INTERNAL_CLI_DIR,
  INTERNAL_BUILD_RESOURCES_DIR,
  INTERNAL_NSIS_INCLUDE,
  INTERNAL_NSIS_INCLUDE_PATH,
  INTERNAL_PRODUCT_NAME,
  createInternalBuilderConfig,
  writeInternalBuilderConfig
} from './package-windows-internal-config.mjs';

describe('internal Windows package config', () => {
  it('uses a custom install hook for existing internal shortcuts', () => {
    const config = createInternalBuilderConfig({
      appId: 'com.foliole.desktop',
      directories: { output: 'artifacts/windows' },
      nsis: { shortcutName: 'Foliole' },
      productName: 'Foliole',
      win: { artifactName: '${productName}-Setup-${version}-win-${arch}.${ext}' }
    }, '9.8.7-internal.20260702120000');

    expect(config.appId).toBe(INTERNAL_APP_ID);
    expect(config.productName).toBe(INTERNAL_PRODUCT_NAME);
    expect(config.electronDist).toBe('node_modules/electron/dist');
    expect(config.directories.buildResources).toBe(INTERNAL_BUILD_RESOURCES_DIR);
    expect(config.nsis.include).toBe(INTERNAL_NSIS_INCLUDE_PATH);
    expect(config.nsis.shortcutName).toBe(INTERNAL_PRODUCT_NAME);
  });

  it('writes the generated NSIS include beside the internal builder config', { meta: { calibratedMs: 15_000 } }, () => {
    const root = mkdtempSync(join(tmpdir(), 'foliole-internal-config-test-'));
    try {
      mkdirSync(join(root, 'electron'), { recursive: true });
      writeFileSync(join(root, 'electron/builder.json'), JSON.stringify({
        appId: 'com.foliole.desktop',
        directories: { output: 'artifacts/windows' },
        nsis: { shortcutName: 'Foliole' },
        productName: 'Foliole',
        win: { artifactName: '${productName}-Setup-${version}-win-${arch}.${ext}' }
      }));

      writeInternalBuilderConfig(root, '9.8.7-internal.20260702120000');

      expect(readFileSync(join(root, INTERNAL_NSIS_INCLUDE_PATH), 'utf8')).toBe(INTERNAL_NSIS_INCLUDE);
      expect(readFileSync(join(root, '.tmp/electron-builder-internal.json'), 'utf8')).toContain(INTERNAL_NSIS_INCLUDE_PATH);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('ships a CLI launcher that runs the Internal executable', () => {
    const root = mkdtempSync(join(tmpdir(), 'foliole-internal-cli-test-'));
    try {
      mkdirSync(join(root, 'electron'), { recursive: true });
      mkdirSync(join(root, 'build/cli'), { recursive: true });
      writeFileSync(join(root, 'build/cli/foliole.cmd'), readFileSync('build/cli/foliole.cmd', 'utf8'));
      writeFileSync(join(root, 'electron/builder.json'), JSON.stringify({
        extraFiles: [{ from: 'build/cli', to: 'bin' }],
        nsis: {},
        productName: 'Foliole'
      }));

      writeInternalBuilderConfig(root, '9.8.7-internal.20260702120000');

      const config = JSON.parse(readFileSync(join(root, '.tmp/electron-builder-internal.json'), 'utf8'));
      expect(config.extraFiles).toEqual([{ from: INTERNAL_CLI_DIR, to: 'bin' }]);
      const launcher = readFileSync(join(root, INTERNAL_CLI_DIR, 'foliole.cmd'), 'utf8');
      expect(launcher).toContain(`"%~dp0..\\${INTERNAL_PRODUCT_NAME}.exe" "%~dp0..\\resources\\scripts\\agent-control\\foliole-agent.mjs" %*`);
      expect(launcher).not.toContain('Foliole.exe"');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
