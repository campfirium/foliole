#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB_TEST_PATTERN = /\.test\.tsx?$/u;

export function normalizeRepoPath(repoRoot, filePath) {
  return path.relative(repoRoot, path.resolve(filePath)).replaceAll('\\', '/');
}

function collectFiles(directoryPath) {
  const files = [];
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
    } else if (entry.isFile() && LIB_TEST_PATTERN.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

export function discoverLibTests(repoRoot) {
  const libRoot = path.join(repoRoot, 'lib');
  if (!existsSync(libRoot)) {
    return [];
  }
  return collectFiles(libRoot).map((file) => normalizeRepoPath(repoRoot, file)).sort();
}

export function parseCollectedLibTests(repoRoot, output) {
  const entries = JSON.parse(output);
  return entries
    .map((entry) => normalizeRepoPath(repoRoot, entry.file))
    .filter((file) => file.startsWith('lib/') && LIB_TEST_PATTERN.test(file))
    .sort();
}

export function findMissingTests(discovered, collected) {
  const collectedSet = new Set(collected);
  return discovered.filter((file) => !collectedSet.has(file));
}

function resolveVitestCommand(repoRoot, env) {
  if (env.VITEST_BIN) {
    const isModule = /\.[cm]?js$/iu.test(env.VITEST_BIN);
    return isModule
      ? { argsPrefix: [env.VITEST_BIN], command: process.execPath, shell: false }
      : { argsPrefix: [], command: env.VITEST_BIN, shell: process.platform === 'win32' && /\.cmd$/iu.test(env.VITEST_BIN) };
  }
  return {
    argsPrefix: [path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs')],
    command: process.execPath,
    shell: false
  };
}

export function listCollectedLibTests(repoRoot, env = process.env) {
  const vitest = resolveVitestCommand(repoRoot, env);
  const args = [
    ...vitest.argsPrefix,
    'list',
    '--filesOnly',
    '--json',
    '--exclude=src/**',
    '--exclude=electron/**',
    '--exclude=scripts/**'
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(vitest.command, args, { cwd: repoRoot, env, shell: vitest.shell });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`vitest list exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(parseCollectedLibTests(repoRoot, stdout));
    });
  });
}

async function main() {
  const repoRoot = process.cwd();
  const discovered = discoverLibTests(repoRoot);
  const collected = await listCollectedLibTests(repoRoot);
  const missing = findMissingTests(discovered, collected);
  if (missing.length > 0) {
    console.error(`[lib-test-collection] ${missing.length} test file(s) are not collected by Vitest:`);
    for (const file of missing) {
      console.error(`  ${file}`);
    }
    return 1;
  }
  console.log(`[lib-test-collection] collected ${collected.length}/${discovered.length} lib test files`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`[lib-test-collection] ${error.message}`);
    process.exitCode = 1;
  });
}
