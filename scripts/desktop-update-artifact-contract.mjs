#!/usr/bin/env node
/* global console, process */

import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';

function yamlScalar(value) {
  const source = value.trim();
  if ((source.startsWith("'") && source.endsWith("'")) ||
    (source.startsWith('"') && source.endsWith('"'))) return source.slice(1, -1);
  return source;
}

export function parseUpdaterMetadata(source) {
  const metadata = { files: [] };
  let currentFile = null;
  for (const line of source.split(/\r?\n/u)) {
    const fileStart = line.match(/^\s+- url:\s*(.+)$/u);
    if (fileStart) {
      currentFile = { url: yamlScalar(fileStart[1]) };
      metadata.files.push(currentFile);
      continue;
    }
    const nested = line.match(/^\s+(sha512|size):\s*(.+)$/u);
    if (nested && currentFile) {
      currentFile[nested[1]] = nested[1] === 'size' ? Number(nested[2]) : yamlScalar(nested[2]);
      continue;
    }
    const topLevel = line.match(/^(version|path|sha512):\s*(.+)$/u);
    if (topLevel) metadata[topLevel[1]] = yamlScalar(topLevel[2]);
  }
  return metadata;
}

function expectedArtifacts(platform, version) {
  if (platform === 'macos') {
    const base = `Foliole-macOS-arm64-${version}`;
    return { checksumTarget: `${base}.dmg`, metadata: 'latest-mac.yml', updateTarget: `${base}.zip` };
  }
  if (platform === 'windows') {
    const target = `Foliole-Windows-x64-${version}.exe`;
    return { checksumTarget: target, metadata: 'latest.yml', updateTarget: target };
  }
  throw new Error(`unsupported desktop update platform: ${platform}`);
}

async function digest(filePath, algorithm, encoding) {
  const bytes = await readFile(filePath);
  return createHash(algorithm).update(bytes).digest(encoding);
}

async function validateChecksumFile(directory, target, checksumFile) {
  const source = (await readFile(path.join(directory, checksumFile), 'utf8')).trim();
  const match = source.match(/^([a-f\d]{64})\s+\*?(.+)$/u);
  if (!match || match[2] !== target) throw new Error(`checksum file must identify ${target}.`);
  const actual = await digest(path.join(directory, target), 'sha256', 'hex');
  if (actual !== match[1]) throw new Error(`${target} SHA256 mismatch.`);
}

function resolveMetadataFile(metadata, target) {
  const files = Array.isArray(metadata.files) ? metadata.files : [];
  const entry = files.find((candidate) => candidate?.url === target);
  if (!entry || metadata.path !== target || metadata.sha512 !== entry.sha512) {
    throw new Error(`updater metadata must resolve exactly to ${target}.`);
  }
  return entry;
}

export async function validateDesktopUpdateArtifacts({
  checksumFile = 'SHA256SUMS.txt', directory, platform, version
}) {
  const expected = expectedArtifacts(platform, version);
  const names = new Set(await readdir(directory));
  for (const name of [expected.checksumTarget, `${expected.checksumTarget}.blockmap`, expected.metadata,
    expected.updateTarget, `${expected.updateTarget}.blockmap`, checksumFile]) {
    if (!names.has(name)) throw new Error(`missing ${platform} updater artifact: ${name}`);
  }
  const metadata = parseUpdaterMetadata(await readFile(path.join(directory, expected.metadata), 'utf8'));
  if (metadata.version !== version) throw new Error(`${expected.metadata} version mismatch.`);
  const entry = resolveMetadataFile(metadata, expected.updateTarget);
  const targetPath = path.join(directory, expected.updateTarget);
  if (entry.size !== (await stat(targetPath)).size) throw new Error(`${expected.updateTarget} size mismatch.`);
  if (entry.sha512 !== await digest(targetPath, 'sha512', 'base64')) {
    throw new Error(`${expected.updateTarget} SHA512 mismatch.`);
  }
  await validateChecksumFile(directory, expected.checksumTarget, checksumFile);
  return { metadata: expected.metadata, target: expected.updateTarget };
}

function readArg(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  assertQualityCommandAllowed('runner:desktop-update-release-gate');
  const result = await validateDesktopUpdateArtifacts({
    directory: path.resolve(readArg('directory') ?? ''),
    platform: readArg('platform'),
    version: readArg('version')
  });
  console.log(`[desktop-update-artifacts] status: VERIFIED metadata=${result.metadata} target=${result.target}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main().catch((error) => {
    console.error(`[desktop-update-artifacts] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
