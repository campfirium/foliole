/* global console, process */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPT_TEST_ROOTS = [
  'scripts',
  'scripts/codex',
  'scripts/demo',
  'scripts/diagnostics',
  'scripts/git',
  'scripts/lib',
  'scripts/linux',
  'scripts/preview',
  'scripts/quality',
  'scripts/sqlite',
  'scripts/sync'
];
const TEST_FILE_PATTERN = /\.test\.mjs$/;

const GATE_INTEGRATION_PRIMARY_BUCKETS = [
  'gate-integration-target-telemetry',
  'gate-integration-target-collect',
  'gate-integration-target-failures',
  'gate-integration-routing',
  'gate-integration-release-targets',
  'gate-integration-fast-delegation',
  'gate-integration-release-tail',
  'gate-integration-target-core'
];

const GATE_INTEGRATION_BUCKETS = {
  'gate-integration-fast-delegation': (name) => name === 'quality-gate-fast.delegation.test.mjs',
  'gate-integration-release-tail': (name) => name === 'quality-gate-release-tail-targets.test.mjs',
  'gate-integration-release-targets': (name) => name === 'quality-gate-release-targets.test.mjs',
  'gate-integration-routing': (name) =>
    name === 'quality-gate-critical-routes.integration.test.mjs' ||
    name === 'quality-gate-fast-light-related.test.mjs' ||
    name === 'quality-gate-fast-lib-routing.test.mjs' ||
    name === 'quality-gate-skip-lint-integration.test.mjs',
  'gate-integration-target-collect': (name) => name === 'quality-gate-target-collect.test.mjs',
  'gate-integration-target-core': (name) => name === 'quality-gate-target.test.mjs',
  'gate-integration-target-failures': (name) => name === 'quality-gate-target-failures.test.mjs',
  'gate-integration-target-telemetry': (name) => name === 'quality-gate-telemetry.test.mjs',
  'gate-integration-targets': (name) =>
    name === 'quality-gate-target-collect.test.mjs' ||
    name === 'quality-gate-target-failures.test.mjs' ||
    name === 'quality-gate-target.test.mjs' ||
    name === 'quality-gate-telemetry.test.mjs'
};

export function gateIntegrationScriptName(bucket) {
  return `test:quality:${bucket.replace('gate-integration-', 'gate-integration:')}`;
}

export const GATE_INTEGRATION_SCRIPT_NAMES = GATE_INTEGRATION_PRIMARY_BUCKETS.map(gateIntegrationScriptName);

export function selectGateIntegrationScriptNames(shard) {
  const shardIndex = { 'integration-one': 0, 'integration-two': 1 }[shard];
  if (shardIndex === undefined) {
    return null;
  }
  return GATE_INTEGRATION_SCRIPT_NAMES.filter((_scriptName, index) => index % 2 === shardIndex);
}

export function isQualityGateTest(filePath) {
  return path.basename(filePath).startsWith('quality-');
}

export function isQualityGateIntegrationTest(filePath) {
  return Object.values(GATE_INTEGRATION_BUCKETS).some((matchesBucket) => matchesBucket(path.basename(filePath)));
}

export function isPreviewDedupeTest(filePath) {
  return path.basename(filePath).startsWith('preview-dedupe');
}

export function isNodeOnlyScriptTest(filePath) {
  return path.basename(filePath) === 'test-files.test.mjs';
}

export function isLinuxOnlyScriptTest(filePath) {
  return filePath.replaceAll('\\', '/').startsWith('scripts/linux/');
}

export function isScriptTestRootPath(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  for (const root of SCRIPT_TEST_ROOTS) {
    if (root === 'scripts') {
      const relative = normalized.startsWith('scripts/') ? normalized.slice('scripts/'.length) : '';
      if (relative && !relative.includes('/')) {
        return true;
      }
      continue;
    }
    if (normalized === root || normalized.startsWith(`${root}/`)) {
      return true;
    }
  }
  return false;
}

export function changedFilesNeedScriptTests(files) {
  const changed = files.map((file) => file.replaceAll('\\', '/').trim()).filter(Boolean);
  return changed.length === 0 || changed.some(isScriptTestRootPath);
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

export function collectScriptTestFiles() {
  const files = [];
  for (const root of SCRIPT_TEST_ROOTS) {
    files.push(...collectRootTestFiles(root, root !== 'scripts'));
  }
  return [...new Set(files)].sort();
}

export function selectScriptTestBucketFiles(bucket, files, platform = process.platform) {
  if (bucket === 'all') {
    return files;
  }
  if (bucket === 'gate') {
    return files.filter((file) => isQualityGateTest(file) && !isQualityGateIntegrationTest(file));
  }
  if (bucket === 'gate-one' || bucket === 'gate-two') {
    const shardIndex = bucket === 'gate-one' ? 0 : 1;
    return selectScriptTestBucketFiles('gate', files, platform)
      .filter((_file, index) => index % 2 === shardIndex);
  }
  if (bucket === 'gate-integration') {
    return files.filter((file) => isQualityGateTest(file) && isQualityGateIntegrationTest(file));
  }
  if (bucket in GATE_INTEGRATION_BUCKETS) {
    return files.filter((file) => GATE_INTEGRATION_BUCKETS[bucket](path.basename(file)));
  }
  if (bucket === 'preview') {
    return files.filter(isPreviewDedupeTest);
  }
  if (bucket === 'node') {
    return files.filter(isNodeOnlyScriptTest);
  }
  if (bucket === 'core') {
    return files.filter((file) => (
      !isQualityGateTest(file) &&
      !isPreviewDedupeTest(file) &&
      !isNodeOnlyScriptTest(file) &&
      (platform !== 'win32' || !isLinuxOnlyScriptTest(file))
    ));
  }
  if (bucket === 'core-one' || bucket === 'core-two') {
    const shardIndex = bucket === 'core-one' ? 0 : 1;
    return selectScriptTestBucketFiles('core', files, platform)
      .filter((_file, index) => index % 2 === shardIndex);
  }
  return null;
}

function main() {
  const [command] = process.argv.slice(2);
  if (command === 'changed-files-need-script-tests') {
    const input = process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
    process.exitCode = changedFilesNeedScriptTests(input.split(/\r?\n/u)) ? 0 : 1;
    return;
  }
  console.error('Usage: node scripts/script-test-bucket-selection.mjs changed-files-need-script-tests');
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
