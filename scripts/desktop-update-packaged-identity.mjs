#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractFile } from '@electron/asar';
import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';

export function validatePackagedDesktopIdentity({ asarPath, version }) {
  const packageJson = JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'));
  if (packageJson.version !== version) throw new Error('packaged application version mismatch.');
  if (packageJson.folioleBuildChannel !== 'github') {
    throw new Error('packaged application is not a GitHub updater distribution.');
  }
  return { channel: packageJson.folioleBuildChannel, version: packageJson.version };
}

async function resolveMacosAsar(zipPath, extractRoot) {
  const result = spawnSync('ditto', ['-x', '-k', zipPath, extractRoot], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`unable to extract macOS ZIP: ${result.stderr.trim()}`);
  const appName = (await readdir(extractRoot)).find((name) => name.endsWith('.app'));
  if (!appName) throw new Error('macOS ZIP does not contain an application bundle.');
  return path.join(extractRoot, appName, 'Contents/Resources/app.asar');
}

function readArg(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  assertQualityCommandAllowed('runner:desktop-update-release-gate');
  const version = readArg('version');
  const asarPath = readArg('asar');
  const zipPath = readArg('macos-zip');
  const extractRoot = readArg('extract-root');
  if (!version || (!asarPath && !(zipPath && extractRoot))) {
    throw new Error('--version and either --asar or --macos-zip with --extract-root are required.');
  }
  const resolvedAsar = asarPath
    ? path.resolve(asarPath)
    : await resolveMacosAsar(path.resolve(zipPath), path.resolve(extractRoot));
  await readFile(resolvedAsar);
  const result = validatePackagedDesktopIdentity({ asarPath: resolvedAsar, version });
  console.log(`[desktop-update-identity] status: VERIFIED channel=${result.channel} version=${result.version}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main().catch((error) => {
    console.error(`[desktop-update-identity] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
