#!/usr/bin/env node
/* global console, process */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;

function requireVersion(version) {
  if (!VERSION.test(version ?? '')) throw new Error('version must be a stable semantic version');
  return version;
}

export function linuxAppImageName(version) {
  return `Foliole-Linux-Experimental-x64-${requireVersion(version)}.AppImage`;
}

export function linuxReleaseAssetNames(version) {
  return [linuxAppImageName(version), 'SHA256SUMS-linux.txt'];
}

export function managedReleaseAssetNames(version) {
  requireVersion(version);
  return [
    `Foliole-macOS-arm64-${version}.dmg`,
    `Foliole-macOS-arm64-${version}.dmg.blockmap`,
    `Foliole-macOS-arm64-${version}.zip`,
    `Foliole-macOS-arm64-${version}.zip.blockmap`,
    'latest-mac.yml',
    'SHA256SUMS-macos.txt',
    `Foliole-Windows-x64-${version}.exe`,
    `Foliole-Windows-x64-${version}.exe.blockmap`,
    'latest.yml',
    'SHA256SUMS-windows.txt',
    ...linuxReleaseAssetNames(version)
  ].sort();
}

export function assertExactAssetNames(actual, expected, label) {
  const normalized = [...new Set(actual.filter(Boolean))].sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(normalized) !== JSON.stringify(wanted)) {
    throw new Error(`${label} asset set mismatch: expected=${wanted.join(',')} actual=${normalized.join(',')}`);
  }
  if (normalized.includes('latest-linux.yml')) throw new Error('latest-linux.yml must not be published');
  return normalized;
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

export async function verifyLinuxArtifactDirectory(directory, version) {
  const appImage = linuxAppImageName(version);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  assertExactAssetNames(files, [appImage, 'SHA256SUMS.txt'], 'Linux package');
  const checksum = (await readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8')).trim();
  const match = checksum.match(/^([a-f0-9]{64}) \*([^\r\n]+)$/u);
  if (!match || match[2] !== appImage) throw new Error('Linux checksum file must name the exact AppImage');
  const actual = await sha256(path.join(directory, appImage));
  if (match[1] !== actual) throw new Error('Linux AppImage checksum mismatch');
  return { appImage, checksum: actual };
}

function readArg(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const version = readArg('version');
  const directory = readArg('directory');
  const namesFile = readArg('release-names');
  if (!version || (!directory && !namesFile) || (directory && namesFile)) {
    throw new Error('--version and exactly one of --directory or --release-names are required');
  }
  if (directory) {
    const result = await verifyLinuxArtifactDirectory(directory, version);
    console.log(`[linux-release-contract] status=VERIFIED appimage=${result.appImage} sha256=${result.checksum}`);
    return;
  }
  const names = (await readFile(namesFile, 'utf8')).split(/\r?\n/u).filter(Boolean);
  assertExactAssetNames(names, managedReleaseAssetNames(version), 'GitHub Release');
  console.log(`[linux-release-contract] status=VERIFIED release_assets=${names.length}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[linux-release-contract] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
