// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { runCli } from './check-settings-classification.mjs';

const tempDirs = [];

async function createFixtureRoot({ appSettings, classifications }) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'settings-classification-'));
  tempDirs.push(fixtureRoot);
  const configDir = path.join(fixtureRoot, 'src/shared/config');
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(configDir, 'appSettings.ts'), appSettings, 'utf8');
  await writeFile(path.join(configDir, 'appSettingsClassification.ts'), classifications, 'utf8');
  return fixtureRoot;
}

function createWritableBuffer() {
  const chunks = [];
  return {
    chunks,
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    }
  };
}

function createClassificationSource(overrides = {}) {
  const arrays = {
    RUNTIME_MIRRORED_APP_SETTING_NAMES: ['uiFont'],
    RENDERER_PREFERENCE_APP_SETTING_NAMES: [],
    DESKTOP_RUNTIME_APP_SETTING_NAMES: ['desktopOnly'],
    CROSS_HOST_SYNC_APP_SETTING_NAMES: ['syncEnabled'],
    UI_SESSION_ONLY_APP_SETTING_NAMES: [],
    ...overrides
  };
  return Object.entries(arrays)
    .map(([name, values]) => `export const ${name} = [${values.map((value) => `'${value}'`).join(',')}] as const;`)
    .join('\n');
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe('check-settings-classification', () => {
  it('passes when every app setting key has one classification', async () => {
    const fixtureRoot = await createFixtureRoot({
      appSettings: `
        export const APP_SETTINGS_STORAGE_KEYS = {
          uiFont: 'foliole-ui-font-preset',
          desktopOnly: 'foliole-desktop-only',
          syncEnabled: 'foliole-sync-enabled'
        } as const;
      `,
      classifications: createClassificationSource()
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const cliResult = runCli({ repoRoot: fixtureRoot, stdout, stderr });

    expect(cliResult.exitCode).toBe(0);
    expect(stdout.chunks.join('')).toContain('status: OK');
    expect(stderr.chunks.join('')).toBe('');
  });

  it('fails when a key is missing from classification', async () => {
    const fixtureRoot = await createFixtureRoot({
      appSettings: `
        export const APP_SETTINGS_STORAGE_KEYS = {
          uiFont: 'foliole-ui-font-preset',
          missingKey: 'foliole-missing-key',
          desktopOnly: 'foliole-desktop-only',
          syncEnabled: 'foliole-sync-enabled'
        } as const;
      `,
      classifications: createClassificationSource()
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const cliResult = runCli({ repoRoot: fixtureRoot, stdout, stderr });
    const output = `${stdout.chunks.join('')}${stderr.chunks.join('')}`;

    expect(cliResult.exitCode).toBe(1);
    expect(output).toContain('unclassified=missingKey');
  });

  it('fails when classification references an unknown or duplicate key', async () => {
    const fixtureRoot = await createFixtureRoot({
      appSettings: `
        export const APP_SETTINGS_STORAGE_KEYS = {
          uiFont: 'foliole-ui-font-preset',
          desktopOnly: 'foliole-desktop-only',
          syncEnabled: 'foliole-sync-enabled'
        } as const;
      `,
      classifications: createClassificationSource({
        RUNTIME_MIRRORED_APP_SETTING_NAMES: ['uiFont', 'ghostKey'],
        RENDERER_PREFERENCE_APP_SETTING_NAMES: ['uiFont']
      })
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const cliResult = runCli({ repoRoot: fixtureRoot, stdout, stderr });
    const output = `${stdout.chunks.join('')}${stderr.chunks.join('')}`;

    expect(cliResult.exitCode).toBe(1);
    expect(output).toContain('unknown-classification=ghostKey');
    expect(output).toContain('duplicate-classification=uiFont');
  });

  it('fails when a persisted storage key is classified as UI session only', async () => {
    const fixtureRoot = await createFixtureRoot({
      appSettings: `
        export const APP_SETTINGS_STORAGE_KEYS = {
          uiFont: 'foliole-ui-font-preset',
          desktopOnly: 'foliole-desktop-only',
          syncEnabled: 'foliole-sync-enabled'
        } as const;
      `,
      classifications: createClassificationSource({
        UI_SESSION_ONLY_APP_SETTING_NAMES: ['syncEnabled']
      })
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const cliResult = runCli({ repoRoot: fixtureRoot, stdout, stderr });

    expect(cliResult.exitCode).toBe(1);
    expect(`${stdout.chunks.join('')}${stderr.chunks.join('')}`).toContain('ui-session-only-storage-key=syncEnabled');
  });
});
