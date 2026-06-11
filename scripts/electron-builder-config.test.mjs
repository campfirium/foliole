// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const builderConfigPath = resolve(__dirname, '../electron/builder.json');
const installerNshPath = resolve(__dirname, '../build/installer.nsh');
const packageJsonPath = resolve(__dirname, '../package.json');
const releaseWorkflowPath = resolve(__dirname, '../.github/workflows/release-windows.yml');

async function readBuilderConfig() {
  const source = await readFile(builderConfigPath, 'utf8');
  return JSON.parse(source);
}

async function readPackageJson() {
  const source = await readFile(packageJsonPath, 'utf8');
  return JSON.parse(source);
}

async function readInstallerNsh() {
  return readFile(installerNshPath, 'utf8');
}

async function readReleaseWorkflow() {
  return readFile(releaseWorkflowPath, 'utf8');
}

describe('electron-builder release packaging config', () => {
  it('keeps better-sqlite3 native bindings outside the asar archive', async () => {
    const config = await readBuilderConfig();

    expect(config.asar).toBe(true);
    expect(config.asarUnpack).toContain('**/node_modules/better-sqlite3/build/Release/*.node');
  });

  it('trims bundled desktop app content to runtime dependencies and selected Electron locales', async () => {
    const config = await readBuilderConfig();

    expect(config.electronLanguages).toEqual(['en-US', 'zh-CN']);
    expect(config.files).toEqual(expect.arrayContaining([
      '!node_modules/@capacitor/**',
      '!node_modules/@capacitor-community/**',
      '!node_modules/@mermaid-js/**',
      '!node_modules/@rollup/**',
      '!node_modules/@stencil/**',
      '!node_modules/jeep-sqlite/**',
      '!node_modules/lucide-react/**',
      '!node_modules/mermaid/**',
      '!node_modules/sql.js/**',
      '!node_modules/better-sqlite3/deps/**',
      '!node_modules/better-sqlite3/src/**',
      '!node_modules/@codemirror/**',
      '!node_modules/@lezer/**',
      '!node_modules/@radix-ui/**',
      '!node_modules/@tanstack/**',
      '!node_modules/clsx/**',
      '!node_modules/cytoscape/**',
      '!node_modules/cytoscape-fcose/**',
      '!node_modules/d3/**',
      '!node_modules/dagre-d3-es/**',
      '!node_modules/katex/**',
      '!node_modules/react/**',
      '!node_modules/react-dom/**',
      '!node_modules/react-pdf/**',
      '!node_modules/roughjs/**',
      '!node_modules/tailwind-merge/**',
      '!node_modules/zustand/**',
      '!node_modules/pdfjs-dist/build/**',
      '!node_modules/pdfjs-dist/legacy/**/*.map',
      '!node_modules/pdfjs-dist/legacy/web/**',
      '!node_modules/pdfjs-dist/web/**',
      '!node_modules/pdfjs-dist/**/*.d.mts',
      '!node_modules/vitest/**'
    ]));
    expect(config.files).not.toContain('!node_modules/@napi-rs/**');
  });

  it('keeps compiled test artifacts out of packaged Electron runtime files', async () => {
    const config = await readBuilderConfig();

    expect(config.files).toContain('electron/preload.cjs');
    expect(config.files).toEqual(expect.arrayContaining([
      '!electron-dist/**/*.test.js',
      '!electron-dist/**/*.test.helpers.js',
      '!electron-dist/**/*test-support.js'
    ]));
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

  it('publishes only the Windows installer to the private GitHub draft release', async () => {
    const [config, packageJson, workflow] = await Promise.all([
      readBuilderConfig(),
      readPackageJson(),
      readReleaseWorkflow()
    ]);

    expect(config.publish).toBeUndefined();
    expect(packageJson.scripts['release:windows:package']).toBe('node scripts/windows/package-windows.mjs --native');
    expect(workflow).toContain('permissions:\n  contents: write');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('attestations: write');
    expect(workflow).toContain('runs-on: windows-latest');
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(workflow).toContain('npm run release:windows:package');
    expect(workflow).toContain('Generate installer checksum');
    expect(workflow).toContain('Set-Content -Path release/SHA256SUMS.txt -Encoding ascii');
    expect(workflow).toContain('actions/attest@v4');
    expect(workflow).toContain('subject-checksums: release/SHA256SUMS.txt');
    expect(workflow).toContain('gh release create $tagName $installer.FullName $checksums.FullName --draft');
    expect(workflow).toContain('--title $releaseTitle --notes $notes');
    expect(workflow).toContain('Windows alpha; please use test data and keep your own backup.');
    expect(workflow).not.toContain('SmartScreen');
    expect(workflow).not.toContain('Advanced provenance check:');
    expect(workflow).toContain('gh release delete $tagName --yes');
    expect(workflow).not.toContain('release/*.blockmap');
    expect(workflow).not.toContain('release/latest.yml');
  });

  it('uses the branded app icon for packaged desktop targets', async () => {
    const config = await readBuilderConfig();

    expect(config.files).toContain('build/icon.png');
    expect(config.win.icon).toBe('build/icon.ico');
    expect(config.linux.icon).toBe('build/icon.png');
  });

  it('uses a per-user assisted Windows installer with directory choice, default shortcuts, and launch', async () => {
    const config = await readBuilderConfig();

    expect(config.win.artifactName).toBe('${productName}-Setup-${version}-win-${arch}.${ext}');
    expect(config.nsis.oneClick).toBe(false);
    expect(config.nsis.allowToChangeInstallationDirectory).toBe(true);
    expect(config.nsis.perMachine).toBe(false);
    expect(config.nsis.createStartMenuShortcut).toBe(true);
    expect(config.nsis.createDesktopShortcut).toBe(true);
    expect(config.nsis.runAfterFinish).toBe(true);
    expect(config.nsis.shortcutName).toBe('Foliole');
    expect(config.fileAssociations).toBeUndefined();
  });

  it('registers Markdown as a per-user open-with capability without taking over defaults', async () => {
    const installer = await readInstallerNsh();

    expect(installer).toContain('WriteRegNone HKCU "Software\\Classes\\.md\\OpenWithProgids" "Foliole.Markdown"');
    expect(installer).toContain('WriteRegNone HKCU "Software\\Classes\\.markdown\\OpenWithProgids" "Foliole.Markdown"');
    expect(installer).toContain('WriteRegStr HKCU "Software\\RegisteredApplications" "Foliole" "Software\\Foliole\\Capabilities"');
    expect(installer).not.toContain('UserChoice');
    expect(installer).not.toContain('System::Call');
    expect(installer).not.toContain('WriteRegStr HKCU "Software\\Classes\\.md" ""');
    expect(installer).not.toContain('WriteRegStr HKCU "Software\\Classes\\.markdown" ""');
  });
});
