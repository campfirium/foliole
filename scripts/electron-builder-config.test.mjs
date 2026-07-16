// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const builderConfigPath = resolve(__dirname, '../electron/builder.json');
const installerNshPath = resolve(__dirname, '../build/installer.nsh');
const packageJsonPath = resolve(__dirname, '../package.json');
const appIconGeneratorPath = resolve(__dirname, 'brand/generate_app_icons.py');
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

function normalizeLineEndings(value) {
  return value.replaceAll('\r\n', '\n');
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
    expect(config.files).toContain('dist/desktop/**/*');
    expect(config.files).not.toContain('dist/**/*');
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
    expect(config.files).toContain('electron/globalCapturePanelPreload.cjs');
    expect(config.files).toContain('electron/globalCaptureToastPreload.cjs');
    expect(config.files).toEqual(expect.arrayContaining([
      '!dist/electron/**/*.test.js',
      '!dist/electron/**/*.test.helpers.js',
      '!dist/electron/**/*test-support.js',
      '!dist/lib/**/*.test.js',
      '!dist/lib/**/*.test.helpers.js',
      '!dist/lib/**/*test-support.js'
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

  it('publishes the Windows installer and updater metadata to the GitHub draft release', async () => {
    const [config, packageJson, workflowSource] = await Promise.all([
      readBuilderConfig(),
      readPackageJson(),
      readReleaseWorkflow()
    ]);
    const workflow = normalizeLineEndings(workflowSource);

    expect(config.publish).toEqual([{
      owner: 'campfirium',
      provider: 'github',
      releaseType: 'release',
      repo: 'foliole'
    }]);
    expect(config.directories.output).toBe('artifacts/windows');
    expect(packageJson.scripts['release:windows:package']).toBe('node scripts/windows/package-windows.mjs');
    expect(packageJson.scripts['windows:package:internal']).toBe('node scripts/windows/package-windows.mjs --internal');
    expect(packageJson.scripts['windows:package:internal:install']).toBe('node scripts/windows/package-windows.mjs --internal --install');
    expect(workflow).toContain('permissions:\n  contents: write');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('attestations: write');
    expect(workflow).toContain('runs-on: windows-latest');
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(workflow).toContain('node scripts/windows/write-artifact-signing-builder-config.mjs');
    expect(workflow).toContain('npm run windows:package');
    expect(workflow).toContain('node scripts/windows/package-windows.mjs --install-existing');
    expect(workflow).toContain('node scripts/windows/verify-artifact-signatures.mjs');
    expect(workflow).toContain('Generate installer checksum');
    expect(workflow).toContain('Set-Content -Path artifacts/windows/SHA256SUMS.txt -Encoding ascii');
    expect(workflow).toContain('actions/attest@v4');
    expect(workflow).toContain('subject-checksums: artifacts/windows/SHA256SUMS.txt');
    expect(workflow).toContain('gh release create $tagName $installer.FullName $blockmap.FullName $updateMetadata.FullName $checksums.FullName --draft');
    expect(workflow).toContain('--title $releaseTitle --target $targetCommit --notes-file $notesFile.FullName');
    expect(workflow).toContain('$reviewedNotesFile = "releases/github/v$version.md"');
    expect(workflow).toContain('Copy-Item $reviewedNotesFile "artifacts/windows/release-v$version-github-body.md"');
    expect(workflow).not.toContain('SmartScreen');
    expect(workflow).not.toContain('Advanced provenance check:');
    expect(workflow).toContain('gh release delete $tagName --yes');
    expect(workflow).toContain('artifacts/windows/*.blockmap');
    expect(workflow).toContain('artifacts/windows/latest.yml');
  });

  it('uses the branded app icon for packaged desktop targets', async () => {
    const config = await readBuilderConfig();

    expect(config.files).toContain('build/icon.png');
    expect(config.files).toContain('build/icon-macos.png');
    expect(config.extraResources).toContainEqual({
      from: 'build/icon.ico',
      to: 'build/icon.ico'
    });
    expect(config.extraResources).toContainEqual({
      from: 'scripts/agent-control',
      to: 'scripts/agent-control'
    });
    expect(config.win.icon).toBe('build/icon.ico');
    expect(config.linux.icon).toBe('build/icon.png');
    expect(config.mac.icon).toBe('build/icon.icns');
  });

  it('keeps macOS artwork inside the Dock optical-size canvas', async () => {
    const generator = await readFile(appIconGeneratorPath, 'utf8');

    expect(generator).toContain('MACOS_ARTWORK_SCALE = 0.825');
    expect(generator).toContain('output = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))');
    expect(generator).toContain('output.alpha_composite(artwork, (centered, centered))');
  });

  it('uses a per-user assisted Windows installer with directory choice, default shortcuts, and launch', async () => {
    const config = await readBuilderConfig();

    expect(config.win.artifactName).toBe('${productName}-Setup-${version}-win-${arch}.${ext}');
    expect(config.nsis.oneClick).toBe(false);
    expect(config.nsis.include).toBe('build/installer.nsh');
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
