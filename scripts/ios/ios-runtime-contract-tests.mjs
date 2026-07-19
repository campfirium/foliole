#!/usr/bin/env node
/* global process */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const IOS_RUNTIME_CONTRACT_TESTS = [
  'src/shared/platform/companionRuntimeCapabilities.test.ts',
  'src/shared/platform/companionBootstrap.ios.test.ts',
  'src/shared/platform/companion/runtime/iosCompanionDatabaseBootstrap.test.ts',
  'src/shared/platform/companion/sync/cursor/iosCompanionSyncPackCursorStore.test.ts',
  'src/shared/platform/companion/sync/pack-apply/iosCompanionSyncPackApply.test.ts',
  'src/shared/platform/companionSyncPackNodes.test.ts',
  'src/shared/platform/companionSyncPackApply.test.ts',
  'scripts/ios/ios-contract-assets.test.mjs',
  'scripts/ios/ios-sync-pack-transfer-contract.test.mjs'
];

const vitest = spawnSync(process.execPath, [
  'scripts/run-vitest-with-summary.mjs',
  '.tmp/vitest/ios-runtime-contract.json',
  '--',
  '--silent=passed-only',
  '--pool=threads',
  '--maxWorkers=2',
  '--no-file-parallelism',
  ...IOS_RUNTIME_CONTRACT_TESTS
], { cwd: REPO_ROOT, stdio: 'inherit' });

if (vitest.error) throw vitest.error;
if (vitest.status !== 0) {
  process.exitCode = vitest.status ?? 1;
} else {
  const swiftCacheRoot = path.join(REPO_ROOT, '.tmp/artifacts/ios-swift-cache');
  const native = spawnSync('swift', [
    'test',
    '--disable-sandbox',
    '--package-path', 'ios/App',
    '--scratch-path', '.tmp/artifacts/ios-sync-pack-native-tests'
  ], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: path.join(swiftCacheRoot, 'clang'),
      SWIFTPM_MODULECACHE_OVERRIDE: path.join(swiftCacheRoot, 'swiftpm')
    }
  });
  if (native.error) throw native.error;
  process.exitCode = native.status ?? 1;
}
