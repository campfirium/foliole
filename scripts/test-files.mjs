#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

import { controlledElectronSqliteTests } from './native-sqlite-test-policy.mjs';
const TEST_FILE_PATTERN = /\.test\.(?:mjs|ts|tsx)$/;
const ELECTRON_SQLITE_TESTS = new Set(controlledElectronSqliteTests);
const VITEST_POOLS = new Set(['forks', 'threads']);
const DATABASE_CONNECTION_IMPORT_PATTERN = /\b(?:import\b[\s\S]*?\bfrom\s+|import\s*\()\s*['"](?:\.{1,2}\/(?:[\w.-]+\/)*connection|\.{1,2}\/database\/connection)\.js['"]/u;
function printUsage() {
  console.error('Usage: npm run test:files -- <file.test.ts|file.test.tsx|file.test.mjs> [...]');
}

function isRegularFile(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function validateFiles(files) {
  if (files.length === 0) {
    printUsage();
    return false;
  }

  for (const filePath of files) {
    if (!TEST_FILE_PATTERN.test(filePath) || !isRegularFile(filePath)) {
      console.error(`[test:files] expected test file, got: ${filePath}`);
      printUsage();
      return false;
    }
  }
  return true;
}

function validateElectronSqliteTests(files) {
  const sqliteFiles = files
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => ELECTRON_SQLITE_TESTS.has(file) || importsDatabaseConnection(file));
  if (sqliteFiles.length === 0 || isElectronAbiRuntime()) {
    return true;
  }
  console.error([
    '[test:files] real sqlite tests cannot run under the ordinary Node ABI.',
    '[test:files] use the controlled Electron ABI runner:',
    '  npm run test:sqlite:electron -- <file.test.ts|file.test.mjs> [...]',
    ...sqliteFiles.map((file) => `  ${file}`)
  ].join('\n'));
  return false;
}

function isElectronAbiRuntime() {
  return process.env.ELECTRON_RUN_AS_NODE === '1' && typeof process.versions.electron === 'string';
}

function importsDatabaseConnection(filePath) {
  if (!normalizePath(filePath).startsWith('electron/')) {
    return false;
  }
  const source = readFileSync(filePath, 'utf8');
  return DATABASE_CONNECTION_IMPORT_PATTERN.test(source);
}

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/');
}

function resolveVitestPool(env) {
  const pool = env.VITEST_POOL?.trim() || 'threads';
  if (!VITEST_POOLS.has(pool)) {
    throw new Error(`[test:files] unsupported VITEST_POOL: ${pool}`);
  }
  return pool;
}

async function runTestFiles(env) {
  const files = process.argv.slice(2).map(normalizePath);
  if (!validateFiles(files) || !validateElectronSqliteTests(files)) {
    return 1;
  }

  const args = [
    'scripts/run-vitest-with-summary.mjs',
    '.tmp/vitest/files.json',
    '--',
    '--silent=passed-only',
    `--pool=${resolveVitestPool(env)}`,
    '--maxWorkers=2',
    '--no-file-parallelism',
    ...files
  ];
  const child = spawn(process.execPath, args, {
    env: {
      ...env,
      FOLIOLE_EXPECTED_TEST_FILES: JSON.stringify(files)
    },
    stdio: 'inherit'
  });
  const exitCode = await new Promise((resolve) => {
    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
  return exitCode;
}

async function main() {
  return runTestFiles(process.env);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`[test:files] ${error.message}`);
    process.exitCode = 1;
  });
