#!/usr/bin/env node
/* global console, process */

import { createHash } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { linuxAppImageName, verifyLinuxArtifactDirectory } from './linux-release-contract.mjs';

const OUTPUT_DIRECTORY = path.resolve('artifacts/linux');
const GENERATED_CONFIG = path.resolve('.tmp/electron-builder-linux.json');

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`);
}

export function assertLinuxBuildHost(platform = process.platform, arch = process.arch) {
  if (platform !== 'linux' || arch !== 'x64') throw new Error('Linux AppImage packaging requires a Linux x64 host');
}

async function writeLinuxBuilderConfig() {
  const base = JSON.parse(await readFile('electron/builder.json', 'utf8'));
  const config = {
    ...base,
    directories: { ...base.directories, output: 'artifacts/linux' },
    linux: { ...base.linux, target: ['AppImage'] },
    toolsets: { ...base.toolsets, appimage: '1.0.3' }
  };
  await mkdir(path.dirname(GENERATED_CONFIG), { recursive: true });
  await writeFile(GENERATED_CONFIG, `${JSON.stringify(config, null, 2)}\n`);
}

async function writeChecksum(version) {
  const name = linuxAppImageName(version);
  const content = await readFile(path.join(OUTPUT_DIRECTORY, name));
  const checksum = createHash('sha256').update(content).digest('hex');
  await writeFile(path.join(OUTPUT_DIRECTORY, 'SHA256SUMS.txt'), `${checksum} *${name}\n`);
}

export async function packageLinuxAppImage({ version, runCommand = run } = {}) {
  assertLinuxBuildHost();
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  if (!version || version !== packageJson.version) throw new Error('target version must match package.json');
  rmSync(OUTPUT_DIRECTORY, { force: true, recursive: true });
  await writeLinuxBuilderConfig();
  runCommand('npm', ['run', 'build']);
  runCommand('npm', ['run', 'electron:compile']);
  runCommand('npm', ['exec', '--', 'electron-builder', '--config', GENERATED_CONFIG, '--linux', 'AppImage', '--x64', '--publish', 'never']);
  for (const generated of ['latest-linux.yml', 'builder-debug.yml', 'builder-effective-config.yaml']) {
    const target = path.join(OUTPUT_DIRECTORY, generated);
    if (existsSync(target)) rmSync(target, { force: true });
  }
  await writeChecksum(version);
  return verifyLinuxArtifactDirectory(OUTPUT_DIRECTORY, version);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const version = process.argv.find((arg) => arg.startsWith('--version='))?.slice(10);
  packageLinuxAppImage({ version }).then((result) => {
    console.log(`[linux-package] status=PACKAGED appimage=${result.appImage} sha256=${result.checksum}`);
  }).catch((error) => {
    console.error(`[linux-package] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
