// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const builderConfigPath = resolve(__dirname, '../electron/builder.json');
const packageJsonPath = resolve(__dirname, '../package.json');

async function readBuilderConfig() {
  const source = await readFile(builderConfigPath, 'utf8');
  return JSON.parse(source);
}

async function readPackageJson() {
  const source = await readFile(packageJsonPath, 'utf8');
  return JSON.parse(source);
}

describe('electron-builder release packaging config', () => {
  it('keeps better-sqlite3 native bindings outside the asar archive', async () => {
    const config = await readBuilderConfig();

    expect(config.asar).toBe(true);
    expect(config.asarUnpack).toContain('**/node_modules/better-sqlite3/**');
  });

  it('rebuilds native modules during packaged builds', async () => {
    const config = await readBuilderConfig();

    expect(config.npmRebuild).toBe(true);
    expect(config.nativeRebuilder).toBe('sequential');
  });

  it('declares release metadata used by installers and app menus', async () => {
    const [config, packageJson] = await Promise.all([
      readBuilderConfig(),
      readPackageJson()
    ]);

    expect(packageJson.description).toBeTruthy();
    expect(packageJson.author).toBeTruthy();
    expect(packageJson.license).toBe('Apache-2.0');
    expect(config.copyright).toContain('2026');
    expect(config.win.requestedExecutionLevel).toBe('asInvoker');
    expect(config.mac.category).toBe('public.app-category.education');
    expect(config.linux.category).toBe('Education');
  });

  it('uses the branded app icon for packaged desktop targets', async () => {
    const config = await readBuilderConfig();

    expect(config.files).toContain('build/icon.png');
    expect(config.win.icon).toBe('build/icon.ico');
    expect(config.linux.icon).toBe('build/icon.png');
  });
});
