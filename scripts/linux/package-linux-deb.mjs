#!/usr/bin/env node
/* global console, process */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { linuxDebName, verifyLinuxDebDirectory } from './linux-deb-contract.mjs';

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

export function createLinuxBuilderConfig(base) {
  const extraFiles = (base.extraFiles ?? []).filter((entry) => entry.from !== 'build/cli');
  return {
    ...base,
    directories: { ...base.directories, output: 'artifacts/linux' },
    extraFiles: [
      ...extraFiles,
      { from: 'build/linux/foliole', to: 'bin/foliole' },
      { from: 'build/linux/foliole-global-clip', to: 'bin/foliole-global-clip' }
    ],
    linux: { ...base.linux, target: ['deb'] },
    publish: null
  };
}

async function writeBuilderConfig() {
  const base = JSON.parse(await readFile('electron/builder.json', 'utf8'));
  const config = createLinuxBuilderConfig(base);
  await mkdir(path.dirname(GENERATED_CONFIG), { recursive: true });
  await writeFile(GENERATED_CONFIG, `${JSON.stringify(config, null, 2)}\n`);
}

async function keepFormalAssets(version) {
  const expected = linuxDebName(version);
  for (const entry of await readdir(OUTPUT_DIRECTORY, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === expected) continue;
    await rm(path.join(OUTPUT_DIRECTORY, entry.name), { force: true, recursive: true });
  }
  const content = await readFile(path.join(OUTPUT_DIRECTORY, expected));
  const checksum = createHash('sha256').update(content).digest('hex');
  await writeFile(path.join(OUTPUT_DIRECTORY, 'SHA256SUMS.txt'), `${checksum} *${expected}\n`);
}

export async function packageLinuxDeb(version) {
  assertLinuxBuildHost();
  const packageVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
  if (version !== packageVersion) throw new Error('requested Linux version does not match package.json');
  await rm(OUTPUT_DIRECTORY, { force: true, recursive: true });
  await writeBuilderConfig();
  run('npm', ['run', 'build']);
  run('npm', ['run', 'electron:compile']);
  run('node', ['node_modules/electron-builder/cli.js', '--config', GENERATED_CONFIG, '--linux', 'deb', '--x64']);
  await keepFormalAssets(version);
  return verifyLinuxDebDirectory(OUTPUT_DIRECTORY, version);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const version = process.argv.find((arg) => arg.startsWith('--version='))?.slice(10);
  packageLinuxDeb(version).then((result) => {
    console.log(`[linux-deb-package] status=PACKAGED deb=${result.deb} sha256=${result.checksum}`);
  }).catch((error) => {
    console.error(`[linux-deb-package] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
