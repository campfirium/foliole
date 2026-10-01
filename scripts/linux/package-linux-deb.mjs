#!/usr/bin/env node
/* global console, process */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ensureElectronBinary } from '../electron-runtime-binary.mjs';
import { linuxAppImageName, linuxDebName, verifyLinuxPackageDirectory } from './linux-deb-contract.mjs';

const OUTPUT_DIRECTORY = path.resolve('artifacts/linux');
const GENERATED_CONFIG = path.resolve('.tmp/electron-builder-linux-deb.json');

function run(command, args) {
  const result = spawnSync(command, args, { shell: false, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`);
}

export function assertLinuxBuildHost(platform = process.platform, arch = process.arch) {
  if (platform !== 'linux' || arch !== 'x64') throw new Error('Linux DEB packaging requires a Linux x64 host');
}

export function createLinuxBuilderConfig(base, target = 'deb') {
  const extraFiles = (base.extraFiles ?? []).filter((entry) => entry.from !== 'build/cli');
  return {
    ...base,
    directories: { ...base.directories, output: 'artifacts/linux' },
    extraFiles: target === 'deb'
      ? [...extraFiles, { from: 'build/linux/foliole', to: 'bin/foliole' }]
      : extraFiles,
    linux: { ...base.linux, target: [target] },
    ...(target === 'AppImage' ? {
      afterPack: 'scripts/linux/appimage-after-pack.mjs',
      appImage: { ...base.appImage, executableArgs: [] }
    } : {}),
    publish: null
  };
}

async function writeBuilderConfig(target) {
  const base = JSON.parse(await readFile('electron/builder.json', 'utf8'));
  const config = createLinuxBuilderConfig(base, target);
  await mkdir(path.dirname(GENERATED_CONFIG), { recursive: true });
  await writeFile(GENERATED_CONFIG, `${JSON.stringify(config, null, 2)}\n`);
}

async function keepFormalAssets(version) {
  const expected = [linuxDebName(version), linuxAppImageName(version)];
  for (const entry of await readdir(OUTPUT_DIRECTORY, { withFileTypes: true })) {
    if (entry.isFile() && expected.includes(entry.name)) continue;
    await rm(path.join(OUTPUT_DIRECTORY, entry.name), { force: true, recursive: true });
  }
  const checksums = await Promise.all(expected.map(async (asset) => {
    const content = await readFile(path.join(OUTPUT_DIRECTORY, asset));
    return `${createHash('sha256').update(content).digest('hex')} *${asset}`;
  }));
  await writeFile(path.join(OUTPUT_DIRECTORY, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);
}

async function verifyAppImageLauncher(version) {
  const extraction = path.resolve('.tmp/artifacts/linux-appimage-package-check');
  await rm(extraction, { force: true, recursive: true });
  await mkdir(extraction, { recursive: true });
  try {
    const appImage = path.join(OUTPUT_DIRECTORY, linuxAppImageName(version));
    const result = spawnSync(appImage, ['--appimage-extract'], {
      cwd: extraction, encoding: 'utf8', shell: false, stdio: ['ignore', 'ignore', 'pipe']
    });
    if (result.error || result.status !== 0) {
      throw new Error(`AppImage extraction failed: ${result.error?.message ?? result.stderr}`);
    }
    const root = path.join(extraction, 'squashfs-root');
    const [appRun, launcher, expected, runtime] = await Promise.all([
      readFile(path.join(root, 'AppRun'), 'utf8'),
      readFile(path.join(root, 'foliole'), 'utf8'),
      readFile('build/linux/appimage-launcher', 'utf8'),
      stat(path.join(root, 'foliole-runtime'))
    ]);
    if (!appRun.includes('BIN="$APPDIR/foliole"')
      || launcher !== expected || !runtime.isFile() || !(runtime.mode & 0o111)) {
      throw new Error('AppImage is missing its sandbox-enforcing launcher or Electron runtime');
    }
  } finally {
    await rm(extraction, { force: true, recursive: true });
  }
}

export async function packageLinuxDeb(version) {
  assertLinuxBuildHost();
  const packageVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
  if (version !== packageVersion) throw new Error('requested Linux version does not match package.json');
  await rm(OUTPUT_DIRECTORY, { force: true, recursive: true });
  run('npm', ['run', 'build']);
  run('npm', ['run', 'electron:compile']);
  ensureElectronBinary(process.cwd());
  await writeBuilderConfig('deb');
  run('node', ['node_modules/electron-builder/cli.js', '--config', GENERATED_CONFIG, '--linux', 'deb', '--x64']);
  await writeBuilderConfig('AppImage');
  run('node', ['node_modules/electron-builder/cli.js', '--config', GENERATED_CONFIG, '--linux', 'AppImage', '--x64']);
  await verifyAppImageLauncher(version);
  await keepFormalAssets(version);
  return verifyLinuxPackageDirectory(OUTPUT_DIRECTORY, version);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const version = process.argv.find((arg) => arg.startsWith('--version='))?.slice(10);
  packageLinuxDeb(version).then((result) => {
    console.log(`[linux-package] status=PACKAGED assets=${result.join(',')}`);
  }).catch((error) => {
    console.error(`[linux-deb-package] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
