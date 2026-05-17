#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';

const TEST_FILE_PATTERN = /\.test\.(?:mjs|ts|tsx)$/;

function printUsage() {
  console.error('Usage: npm run test:files -- <file.test.ts|file.test.tsx|file.test.mjs> [...]');
}

function isDirectory(filePath) {
  try {
    return statSync(filePath).isDirectory();
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
    if (isDirectory(filePath) || !TEST_FILE_PATTERN.test(filePath)) {
      console.error(`[test:files] expected test file, got: ${filePath}`);
      printUsage();
      return false;
    }
  }
  return true;
}

async function main() {
  const files = process.argv.slice(2);
  if (!validateFiles(files)) {
    process.exit(1);
  }

  const args = [
    'scripts/run-vitest-with-summary.mjs',
    '.tmp/vitest/files.json',
    '--',
    '--silent=passed-only',
    '--pool=threads',
    '--no-file-parallelism',
    ...files
  ];
  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  const exitCode = await new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
  });
  process.exit(exitCode);
}

main();
