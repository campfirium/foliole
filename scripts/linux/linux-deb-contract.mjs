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

export function linuxDebName(version) {
  return `Foliole-Linux-Experimental-amd64-${requireVersion(version)}.deb`;
}

export function linuxAppImageName(version) {
  return `Foliole-Linux-Experimental-amd64-${requireVersion(version)}.AppImage`;
}

export function assertDebMetadata(metadata, version) {
  const expected = { Architecture: 'amd64', Package: 'foliole', Version: requireVersion(version) };
  for (const [field, value] of Object.entries(expected)) {
    if (metadata[field] !== value) throw new Error(`Linux DEB ${field} must be ${value}`);
  }
  return expected;
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

export async function verifyLinuxDebDirectory(directory, version, options = {}) {
  const { allowOtherFiles = false, checksumFile = 'SHA256SUMS.txt' } = options;
  const deb = linuxDebName(version);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  if (!allowOtherFiles && JSON.stringify(files) !== JSON.stringify([checksumFile, deb].sort())) {
    throw new Error(`Linux DEB asset set mismatch: ${files.join(',')}`);
  }
  const checksums = (await readFile(path.join(directory, checksumFile), 'utf8')).trim().split('\n');
  const checksum = checksums.find((line) => line.endsWith(` *${deb}`));
  const match = checksum?.match(/^([a-f0-9]{64}) \*([^\r\n]+)$/u);
  if (!match || match[2] !== deb) throw new Error('Linux checksum must name the exact DEB');
  const actual = await sha256(path.join(directory, deb));
  if (match[1] !== actual) throw new Error('Linux DEB checksum mismatch');
  return { checksum: actual, deb };
}

export async function verifyLinuxPackageDirectory(directory, version, options = {}) {
  const { allowOtherFiles = false, checksumFile = 'SHA256SUMS.txt' } = options;
  const assets = [linuxDebName(version), linuxAppImageName(version)];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  if (!allowOtherFiles && JSON.stringify(files) !== JSON.stringify([checksumFile, ...assets].sort())) {
    throw new Error(`Linux package asset set mismatch: ${files.join(',')}`);
  }
  const checksums = (await readFile(path.join(directory, checksumFile), 'utf8')).trim().split('\n');
  if (checksums.length !== assets.length) throw new Error('Linux package checksum count mismatch');
  for (const asset of assets) {
    const line = checksums.find((entry) => entry.endsWith(` *${asset}`));
    const match = line?.match(/^([a-f0-9]{64}) \*([^\r\n]+)$/u);
    if (!match || match[2] !== asset || match[1] !== await sha256(path.join(directory, asset))) {
      throw new Error(`Linux package checksum mismatch: ${asset}`);
    }
  }
  return assets;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const readArg = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  verifyLinuxDebDirectory(readArg('directory'), readArg('version')).then((result) => {
    console.log(`[linux-deb-contract] status=VERIFIED deb=${result.deb} sha256=${result.checksum}`);
  }).catch((error) => {
    console.error(`[linux-deb-contract] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
