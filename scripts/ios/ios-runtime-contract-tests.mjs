#!/usr/bin/env node
/* global process */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  iosResourceCommand,
  iosSwiftResourceArgs,
  iosVitestResourceArgs,
  resolveIosResourceMode
} from './ios-resource-profile.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const IOS_RUNTIME_CONTRACT_TESTS = [
  'src/shared/platform/companionRuntimeCapabilities.test.ts',
  'src/shared/platform/appLifecycle.test.ts',
  'src/shared/platform/companionSyncStateWriters.ios.test.ts',
  'src/shared/platform/companionSyncObjects.ios.test.ts',
  'src/shared/platform/companionWorkspaceRuntimeRepository.test.ts',
  'src/companion/CompanionBrowseTopActions.test.tsx',
  'src/companion/CompanionNodeMutationAvailability.test.tsx',
  'src/companion/CompanionReadableArticleChromeLayer.test.tsx',
  'src/companion/CompanionReadingSheets.test.tsx',
  'src/companion/CompanionSyncStatusDetails.ios.test.tsx',
  'src/companion/useCompanionImmersiveScrollPosition.test.tsx',
  'src/companion/useCompanionWorkspaceAutoSync.test.tsx',
  'src/shared/platform/companion/sync/diagnostics/companionSyncDiagnostics.ios.test.ts',
  'src/shared/platform/companion/sync/diagnostics/companionSyncDiagnostics.test.ts',
  'src/shared/platform/companion/sync/diagnostics/companionSyncConvergence.test.ts',
  'src/shared/platform/companionPrimaryDeviceIdentity.test.ts',
  'src/shared/platform/companionPrimaryDeviceTakeover.test.ts',
  'src/shared/platform/companionFullTextSearch.test.ts',
  'src/shared/platform/companionWorkspaceDiscovery.test.ts',
  'src/shared/platform/companionWorkspaceSync.pairing.test.ts',
  'src/shared/platform/companionDesktopSyncHttp.test.ts',
  'src/shared/platform/companionAttachmentResourceSync.test.ts',
  'src/shared/platform/companionDesktopAttachmentResources.test.ts',
  'src/shared/platform/companionContentBlobSync.test.ts',
  'src/shared/platform/attachmentResources.test.ts',
  'src/features/editor/adapters/liveMarkdownImages.nativeAttachment.test.ts',
  'src/shared/platform/companionBootstrap.ios.test.ts',
  'src/shared/platform/companion/runtime/iosCompanionDatabaseBootstrap.test.ts',
  'src/shared/platform/companion/sync/cursor/iosCompanionSyncPackCursorStore.test.ts',
  'src/shared/platform/companion/sync/pack-apply/iosCompanionSyncPackApply.test.ts',
  'src/shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotRows.test.ts',
  'src/shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSyncStateStore.test.ts',
  'src/shared/platform/companionSyncPackNodes.test.ts',
  'src/shared/platform/companionSyncPackApply.test.ts',
  'scripts/ios/ios-contract-assets.test.mjs',
  'scripts/ios/ios-external-document-search-host-contract.test.mjs',
  'scripts/ios/ios-sync-object-read-host-contract.test.mjs',
  'scripts/ios/ios-pairing-host-contract.test.mjs',
  'scripts/ios/ios-pdf-page-text-host-contract.test.mjs',
  'scripts/ios/ios-resource-profile.test.mjs',
  'scripts/ios/ios-sync-pack-transfer-contract.test.mjs',
  'scripts/ios/ios-setting-write-host-contract.test.mjs',
  'scripts/ios/ios-sync-diagnostics-host-contract.test.mjs',
  'scripts/ios/ios-topic-search-host-contract.test.mjs',
  'scripts/ios/ios-view-state-write-host-contract.test.mjs'
];

const resourceMode = resolveIosResourceMode();
const vitestTask = iosResourceCommand(process.execPath, [
  'scripts/run-vitest-with-summary.mjs',
  '.tmp/vitest/ios-runtime-contract.json',
  '--',
  '--silent=passed-only',
  '--pool=threads',
  ...iosVitestResourceArgs(resourceMode),
  ...IOS_RUNTIME_CONTRACT_TESTS
], resourceMode);
const vitest = spawnSync(vitestTask.command, vitestTask.args, { cwd: REPO_ROOT, stdio: 'inherit' });

if (vitest.error) throw vitest.error;
if (vitest.status !== 0) {
  process.exitCode = vitest.status ?? 1;
} else {
  const swiftCacheRoot = path.join(REPO_ROOT, '.tmp/artifacts/ios-swift-cache');
  const nativeTask = iosResourceCommand('swift', [
    'test',
    ...iosSwiftResourceArgs(resourceMode),
    '--disable-sandbox',
    '--package-path', 'ios/App',
    '--scratch-path', '.tmp/artifacts/ios-sync-pack-native-tests'
  ], resourceMode);
  const native = spawnSync(nativeTask.command, nativeTask.args, {
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
