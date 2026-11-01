// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPackageWithOptions, extractFile, statFile } from '@electron/asar';
import { ESLint } from 'eslint';
import { afterEach, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve('electron-builder/package.json'));
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const base = path.resolve('.tmp/artifacts/T674/toolchain-compatibility');
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(path.join(base, 'fixture-'));
  roots.push(root);
  mkdirSync(path.join(root, 'native'));
  for (const file of ['main.js', 'main.js.map', 'native/addon.node', '.hidden.txt']) writeFileSync(path.join(root, file), file);
  return root;
}

it('packs application files and keeps native binaries unpacked through the real ASAR API', async () => {
  const root = fixture();
  const archive = path.join(root, 'app.asar');
  const source = path.join(root, 'native');
  await createPackageWithOptions(source, archive, { unpack: '*.node' });
  expect(statFile(archive, 'addon.node').unpacked).toBe(true);
  expect(readFileSync(`${archive}.unpacked/addon.node`, 'utf8')).toBe('native/addon.node');
  expect(extractFile(archive, 'addon.node').toString()).toBe('native/addon.node');
});

it('preserves builder inclusion, exclusion and dot-file matching', () => {
  const root = fixture();
  const { FileMatcher } = builderRequire('app-builder-lib/out/fileMatcher.js');
  const filter = new FileMatcher(root, `${root}-output`, value => value, ['**/*', '!**/*.map']).createFilter();
  for (const name of ['main.js', 'native/addon.node', '.hidden.txt']) {
    const file = path.join(root, name);
    expect(filter(file, statSync(file))).toBe(true);
  }
  const map = path.join(root, 'main.js.map');
  expect(filter(map, statSync(map))).toBe(false);
});

it('preserves legacy Windows installer glob and template FileList consumers', () => {
  const root = fixture();
  const builder = createRequire(builderRequire.resolve('app-builder-lib'));
  const installer = createRequire(builder.resolve('electron-winstaller'));
  const temporary = createRequire(installer.resolve('temp'));
  const remove = createRequire(temporary.resolve('rimraf'));
  expect(remove('glob').sync('**/*.{js,node}', { cwd: root }).sort()).toEqual(['main.js', 'native/addon.node']);
  const { FileList } = builder('filelist');
  expect(new FileList(path.join(root, '**/*.node')).toArray()).toEqual([path.join(root, 'native/addon.node')]);
});

it('keeps the configured import ordering rule active with compatible plugin exports', async () => {
  const eslint = new ESLint({ cache: false });
  const sorted = "import { readFileSync } from 'node:fs';\n\nimport React from 'react';\n\nexport const data = [readFileSync, React];\n";
  const unsorted = "import React from 'react';\n\nimport { readFileSync } from 'node:fs';\n\nexport const data = [readFileSync, React];\n";
  const options = { filePath: 'src/shared/securityToolchainFixture.ts' };
  const errors = result => result[0].messages.filter(message => message.ruleId === 'import/order');
  expect(errors(await eslint.lintText(sorted, options))).toHaveLength(0);
  expect(errors(await eslint.lintText(unsorted, options)).length).toBeGreaterThan(0);
});

async function nativeBundle(root, arch) {
  const app = path.join(root, `${arch}.app`);
  const contents = path.join(app, 'Contents');
  mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  mkdirSync(path.join(contents, 'Resources'));
  const plist = '<?xml version="1.0"?><plist version="1.0"><dict>'
    + '<key>CFBundleExecutable</key><string>fixture</string>'
    + '<key>CFBundleIdentifier</key><string>local.security.fixture</string>'
    + '<key>CFBundleVersion</key><string>1</string></dict></plist>';
  writeFileSync(path.join(contents, 'Info.plist'), plist);
  execFileSync('xcrun', ['clang', '-arch', arch, '-x', 'c', '-', '-o', path.join(contents, 'MacOS/fixture')],
    { input: 'int main(void) { return 0; }', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
  const source = path.join(root, `${arch}-source`);
  mkdirSync(source);
  writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: 'security-fixture', version: '1.0.0', main: 'main.js' }));
  writeFileSync(path.join(source, 'main.js'), 'module.exports = 42;');
  await createPackageWithOptions(source, path.join(contents, 'Resources/app.asar'), {});
  return app;
}

// Mach-O merging is a Mac packaging contract; other hosts retain the portable fixtures above.
it.runIf(process.platform === 'darwin')('merges both native architectures and preserves application payload', async () => {
  const root = fixture();
  const x64AppPath = await nativeBundle(root, 'x86_64');
  const arm64AppPath = await nativeBundle(root, 'arm64');
  const outAppPath = path.join(root, 'universal.app');
  const { makeUniversalApp } = await import(pathToFileURL(builderRequire.resolve('@electron/universal')).href);
  await makeUniversalApp({ x64AppPath, arm64AppPath, outAppPath });
  const architectures = execFileSync('xcrun', ['lipo', '-archs', path.join(outAppPath, 'Contents/MacOS/fixture')], { encoding: 'utf8' });
  expect(architectures).toContain('x86_64');
  expect(architectures).toContain('arm64');
  expect(extractFile(path.join(outAppPath, 'Contents/Resources/app.asar'), 'main.js').toString()).toBe('module.exports = 42;');
}, 60000);
