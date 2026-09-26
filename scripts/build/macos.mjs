/* global console, process */

import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadPinnedCodexHelperRelease } from '../macos/codex-helper-release.mjs';
import { prepareCodexHelper } from '../macos/prepare-codex-helper.mjs';
import { prepareFolioleCli } from '../macos/prepare-foliole-cli.mjs';
import { prepareGlobalCaptureHelper } from '../macos/prepare-global-capture-helper.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUTPUT = path.join(ROOT, 'artifacts/macos/source-arm64');
const CONFIG = path.join(ROOT, '.tmp/macos/source-builder.json');

function run(label, command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

async function verifySourceApp() {
  const app = path.join(OUTPUT, 'mac-arm64/Foliole.app');
  const contents = path.join(app, 'Contents');
  const cli = path.join(contents, 'Helpers/Foliole CLI.app');
  for (const file of [
    path.join(contents, 'MacOS/codex'),
    path.join(contents, 'MacOS/Foliole Global Capture'),
    path.join(cli, 'Contents/MacOS/foliole')
  ]) await access(file);
  const bundleId = spawnSync('plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(cli, 'Contents/Info.plist')], { encoding: 'utf8' });
  if (bundleId.status !== 0 || bundleId.stdout.trim() !== 'org.foliole.source.cli') {
    throw new Error('The source CLI has the wrong bundle identity');
  }
  run('source app signature', 'codesign', ['--verify', '--deep', '--strict', app]);
  run('source CLI smoke', path.join(cli, 'Contents/MacOS/foliole'), ['--version']);
}

export function createSourceBuilderConfig(base, helpers) {
  return {
    ...base,
    afterPack: 'scripts/build/macos-after-pack.mjs',
    appId: 'org.foliole.source',
    directories: { ...base.directories, output: OUTPUT },
    extraMetadata: { ...(base.extraMetadata ?? {}), folioleBuildChannel: 'source' },
    extraFiles: [
      ...(base.extraFiles ?? []).filter((entry) => entry.from !== 'build/cli'),
      { from: helpers.codex, to: 'MacOS/codex' },
      { from: helpers.capture, to: 'MacOS/Foliole Global Capture' },
      { from: helpers.cli, to: 'Helpers/Foliole CLI.app' }
    ],
    extraResources: [
      ...(base.extraResources ?? []),
      { from: 'build/macos/codex-NOTICE.txt', to: 'codex/NOTICE.txt' },
      { from: 'LICENSE', to: 'codex/LICENSE' }
    ],
    publish: null,
    mac: {
      ...base.mac,
      artifactName: '${productName}-macOS-source-${arch}-${version}.${ext}',
      binaries: ['Contents/MacOS/codex', 'Contents/MacOS/Foliole Global Capture'],
      entitlements: 'build/entitlements.mac.source.plist',
      entitlementsInherit: 'build/entitlements.mac.inherit.plist',
      extendInfo: {
        ...(base.mac?.extendInfo ?? {}),
        CFBundleName: 'Foliole Source',
        CFBundleDisplayName: 'Foliole'
      },
      forceCodeSigning: true,
      hardenedRuntime: false,
      identity: '-',
      notarize: false,
      signIgnore: ['Contents/Helpers/Foliole CLI\\.app(?:/|$)'],
      target: ['dmg', 'zip']
    }
  };
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('The macOS source package requires an arm64 Mac');
  }
  const release = await loadPinnedCodexHelperRelease();
  const helpers = {
    codex: await prepareCodexHelper({ release }),
    cli: await prepareFolioleCli({ mode: 'source' }),
    capture: await prepareGlobalCaptureHelper()
  };
  const base = JSON.parse(await readFile(path.join(ROOT, 'electron/builder.json'), 'utf8'));
  await mkdir(path.dirname(CONFIG), { recursive: true });
  await writeFile(CONFIG, `${JSON.stringify(createSourceBuilderConfig(base, helpers), null, 2)}\n`);
  run('renderer build', 'npm', ['run', 'build']);
  run('security bookmark addon', 'npm', ['run', 'macos:security-bookmarks:build']);
  run('Electron compile', 'npm', ['run', 'electron:compile']);
  run('macOS package', 'npm', ['exec', '--', 'electron-builder', '--config', CONFIG, '--mac', '--arm64', '--publish', 'never']);
  await verifySourceApp();
  console.log(`SOURCE_PACKAGE_READY ${OUTPUT}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
