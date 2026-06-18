#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const SCRIPT_TEST_ROOTS = [
  'scripts',
  'scripts/codex',
  'scripts/demo',
  'scripts/diagnostics',
  'scripts/git',
  'scripts/preview',
  'scripts/quality',
  'scripts/sqlite',
  'scripts/sync'
];
const TEST_FILE_PATTERN = /\.test\.mjs$/;

function printUsage() {
  console.error('Usage: node scripts/run-script-test-bucket.mjs <all|core|gate|preview> <report.json>');
}

export function isQualityGateTest(filePath) {
  return path.basename(filePath).startsWith('quality-');
}

export function isPreviewDedupeTest(filePath) {
  return path.basename(filePath).startsWith('preview-dedupe');
}

export function isNodeOnlyScriptTest(filePath) {
  return path.basename(filePath) === 'test-files.test.mjs';
}

function collectRootTestFiles(dirPath, recursive) {
  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...collectRootTestFiles(entryPath, true));
      }
      continue;
    }
    if (TEST_FILE_PATTERN.test(entry.name)) {
      files.push(entryPath.replaceAll('\\', '/'));
    }
  }
  return files;
}

function collectScriptTestFiles() {
  const files = [];
  for (const root of SCRIPT_TEST_ROOTS) {
    files.push(...collectRootTestFiles(root, root !== 'scripts'));
  }
  return [...new Set(files)].sort();
}

export function selectScriptTestBucketFiles(bucket, files) {
  if (bucket === 'all') {
    return files;
  }
  if (bucket === 'gate') {
    return files.filter(isQualityGateTest);
  }
  if (bucket === 'preview') {
    return files.filter(isPreviewDedupeTest);
  }
  if (bucket === 'node') {
    return files.filter(isNodeOnlyScriptTest);
  }
  if (bucket === 'core') {
    return files.filter((file) => !isQualityGateTest(file) && !isPreviewDedupeTest(file) && !isNodeOnlyScriptTest(file));
  }
  return null;
}

function runVitest(reportPath, files) {
  const args = [
    'scripts/run-vitest-with-summary.mjs',
    reportPath,
    '--',
    '--silent=passed-only',
    '--pool=threads',
    '--maxWorkers=2',
    '--no-file-parallelism',
    ...files
  ];
  const child = spawn(process.execPath, args, { env: process.env, stdio: 'inherit' });
  return new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function main() {
  const [bucket, reportPath] = process.argv.slice(2);
  const files = selectScriptTestBucketFiles(bucket, collectScriptTestFiles());
  if (!files || !reportPath) {
    printUsage();
    return 1;
  }
  if (files.length === 0) {
    console.error(`[script-test-bucket] no tests selected for bucket: ${bucket}`);
    return 1;
  }
  return runVitest(reportPath, files);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/run-script-test-bucket.mjs')) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[script-test-bucket] ${error.message}`);
      process.exitCode = 1;
    });
}
