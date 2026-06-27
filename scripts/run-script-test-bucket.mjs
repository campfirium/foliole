#!/usr/bin/env node
/* global console, process */

import { spawn, spawnSync } from 'node:child_process';
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
const DEFAULT_BUCKET_TIMEOUT_SECONDS = 240;
const DEFAULT_INTEGRATION_BUCKET_TIMEOUT_SECONDS = 600;

function printUsage() {
  console.error('Usage: node scripts/run-script-test-bucket.mjs <all|core|gate|gate-integration|node|preview> <report.json>');
}

export function resolveBucketTimeoutSeconds(bucket) {
  const envName = `SCRIPT_TEST_BUCKET_${bucket.toUpperCase().replaceAll(/[^A-Z0-9]/gu, '_')}_TIMEOUT_SECONDS`;
  const fallback = bucket === 'gate-integration'
    ? DEFAULT_INTEGRATION_BUCKET_TIMEOUT_SECONDS
    : DEFAULT_BUCKET_TIMEOUT_SECONDS;
  const raw = process.env[envName] ?? process.env.SCRIPT_TEST_BUCKET_TIMEOUT_SECONDS ?? `${fallback}`;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function terminateChildTree(child) {
  if (!child.pid) {
    child.kill('SIGTERM');
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 1000 });
    return;
  }
  child.kill('SIGTERM');
  globalThis.setTimeout(() => child.kill('SIGKILL'), 1000).unref();
}

export function isQualityGateTest(filePath) {
  return path.basename(filePath).startsWith('quality-');
}

export function isQualityGateIntegrationTest(filePath) {
  const name = path.basename(filePath);
  return (
    name.includes('integration') ||
    name.includes('target') ||
    name.includes('telemetry') ||
    name.includes('release') ||
    name === 'quality-gate-fast.delegation.test.mjs' ||
    name === 'quality-gate-fast-lib-routing.test.mjs'
  );
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
    return files.filter((file) => isQualityGateTest(file) && !isQualityGateIntegrationTest(file));
  }
  if (bucket === 'gate-integration') {
    return files.filter((file) => isQualityGateTest(file) && isQualityGateIntegrationTest(file));
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

function runVitest(bucket, reportPath, files) {
  const timeoutSeconds = resolveBucketTimeoutSeconds(bucket);
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
    let settled = false;
    const finish = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timer);
      resolve(code);
    };
    const timer = globalThis.setTimeout(() => {
      console.error(`[script-test-bucket] ${bucket} exceeded timeout (${timeoutSeconds}s)`);
      terminateChildTree(child);
      finish(1);
      process.exitCode = 1;
      globalThis.setTimeout(() => process.exit(1), 10).unref();
    }, timeoutSeconds * 1000);
    timer.unref();
    child.on('close', (code) => finish(code ?? 1));
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
  return runVitest(bucket, reportPath, files);
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
