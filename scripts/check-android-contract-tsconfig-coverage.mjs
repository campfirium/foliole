#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTRACT_FILE_PATTERN = /^androidCompanion.*\.ts$/u;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.tsx?$/u;

export function normalizeRepoPath(repoRoot, filePath) {
  return path.relative(repoRoot, path.resolve(filePath)).replaceAll('\\', '/');
}

export function discoverAndroidContractFiles(repoRoot) {
  const databaseDir = path.join(repoRoot, 'lib', 'core', 'database');
  return readdirSync(databaseDir)
    .filter((name) => CONTRACT_FILE_PATTERN.test(name) && !TEST_FILE_PATTERN.test(name))
    .map((name) => `lib/core/database/${name}`)
    .sort();
}

export function parseProgramFiles(repoRoot, output) {
  return new Set(output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((filePath) => normalizeRepoPath(repoRoot, filePath)));
}

export function findMissingContractFiles(discovered, programFiles) {
  return discovered.filter((filePath) => !programFiles.has(filePath));
}

function runListFilesOnly(repoRoot) {
  const tscPath = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  return spawnSync(process.execPath, [tscPath, '-p', 'tsconfig.android-contracts.json', '--listFilesOnly', '--pretty', 'false'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
}

export function checkAndroidContractTsconfigCoverage(repoRoot) {
  const result = runListFilesOnly(repoRoot);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'TypeScript listFilesOnly failed');
  }
  const discovered = discoverAndroidContractFiles(repoRoot);
  const programFiles = parseProgramFiles(repoRoot, result.stdout);
  return findMissingContractFiles(discovered, programFiles);
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const missing = checkAndroidContractTsconfigCoverage(repoRoot);
  if (missing.length > 0) {
    console.error('[android-contract-tsconfig] production files missing from program:');
    for (const filePath of missing) console.error(`- ${filePath}`);
    return 1;
  }
  console.log('[android-contract-tsconfig] all production contracts are owned');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main();
}
