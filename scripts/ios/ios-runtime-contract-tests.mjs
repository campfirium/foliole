#!/usr/bin/env node
/* global process */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assertQualityCommandAllowed } from '../quality/quality-command-contracts.mjs';

import {
  iosResourceCommand,
  iosSqliteVitestEnv,
  iosSwiftResourceArgs,
  iosVitestResourceArgs,
  resolveIosResourceMode
} from './ios-resource-profile.mjs';
import { prepareIosRuntimeContractCache } from './ios-local-storage.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
assertQualityCommandAllowed('runner:ios-runtime-contract');

export const IOS_RUNTIME_CONTRACT_TESTS = [
  'src/shared/platform/companionRuntimeCapabilities.test.ts',
  'src/shared/platform/appLifecycle.test.ts',
  'src/shared/platform/companionHandoffNotifications.test.ts',
  'src/shared/platform/companionHandoffNotifications.ios.test.ts',
  'src/shared/platform/companion/sync/mutation/companionSyncMutationRevision.test.ts',
  'src/shared/platform/companionDesktopSyncPush.ios.test.ts',
  'src/shared/platform/companionDesktopSyncPush.nodeVersion.test.ts',
  'src/shared/platform/companionSyncStateWriters.ios.test.ts',
  'src/shared/platform/companionSyncObjects.ios.test.ts',
  'src/shared/platform/companionSyncCursors.test.ts',
  'src/shared/platform/companionWorkspaceRuntimeRepository.test.ts',
  'src/companion/CompanionApp.boot.test.tsx',
  'src/companion/iosAcceptancePairing.test.ts',
  'src/companion/iosBridgeAcceptance.test.ts',
  'src/companion/iosContentResourceAcceptance.test.ts',
  'src/companion/iosDatabaseUpgradeAcceptance.test.ts',
  'src/companion/iosNodeVersionRoundtripAcceptance.test.ts',
  'src/companion/iosStateWritebackAcceptance.test.ts',
  'src/companion/iosSyncGroupDiscoveryAcceptance.test.ts',
  'src/companion/iosSyncTriggerAcceptance.test.ts',
  'src/companion/iosSyncPackAcceptance.test.ts',
  'src/companion/CompanionBrowseTopActions.test.tsx',
  'src/companion/CompanionHandoffReminderRuntime.test.tsx',
  'src/companion/CompanionNodeMutationAvailability.test.tsx',
  'src/companion/CompanionReadableArticleChromeLayer.test.tsx',
  'src/companion/CompanionReadingSheets.test.tsx',
  'src/companion/CompanionSearchContent.ios.test.tsx',
  'src/companion/CompanionSettingsShellContent.ios.test.tsx',
  'src/companion/CompanionSyncDiagnosticsPanel.ios.test.tsx',
  'src/companion/CompanionSyncPanel.disconnect.test.tsx',
  'src/companion/CompanionSyncStatusDetails.activity.test.tsx',
  'src/companion/CompanionSyncStatusDetails.ios.test.tsx',
  'src/companion/companionSyncActivityCopy.test.ts',
  'src/companion/companionSyncFailureMessage.test.ts',
  'src/companion/companionSyncPassResult.localChanges.test.ts',
  'src/companion/companionSyncPassResult.test.ts',
  'src/companion/companionWorkspaceSyncFlow.push.test.ts',
  'src/companion/companionWorkspaceSyncFlow.test.ts',
  'src/companion/companionReviewSchedulerSettingsHydration.ios.test.ts',
  'src/companion/useCompanionImmersiveScrollPosition.test.tsx',
  'src/companion/useCompanionWorkspacePairing.ios.test.tsx',
  'src/companion/useCompanionWorkspaceSync.disconnect.test.tsx',
  'src/companion/useCompanionHandoffReminderSettings.test.tsx',
  'src/companion/useCompanionHandoffReminderScheduler.test.tsx',
  'src/companion/useCompanionWorkspaceAutoSync.ios.test.tsx',
  'src/companion/useCompanionWorkspaceAutoSync.test.tsx',
  'src/features/settings/components/sections/SettingsCompanionSyncSection.test.tsx',
  'src/shared/platform/companion/sync/diagnostics/companionSyncDiagnostics.ios.test.ts',
  'src/shared/platform/companion/sync/diagnostics/companionSyncDiagnostics.test.ts',
  'src/shared/platform/companion/sync/diagnostics/companionSyncConvergence.test.ts',
  'src/shared/platform/companion/sync/syncback/companionSyncbackDbStore.test.ts',
  'src/shared/platform/companionFullTextSearch.test.ts',
  'src/shared/platform/companionWorkspaceDiscovery.test.ts',
  'src/shared/platform/companionWorkspaceSync.concurrent.ios.test.ts',
  'src/shared/platform/companionWorkspaceSync.endpoint.ios.test.ts',
  'src/shared/platform/companionWorkspaceSync.disconnect.ios.test.ts',
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
  'scripts/ios/fri-dev-workflow.test.mjs',
  'scripts/ios/fri-physical-readiness.test.mjs',
  'scripts/ios/fri-two-device-run-proof.test.mjs',
  'scripts/ios/ios-acceptance-contract-corpus.test.mjs',
  'scripts/ios/ios-acceptance-mechanical-push.test.mjs',
  'scripts/ios/ios-acceptance-sync-event-projection.test.mjs',
  'scripts/ios/ios-content-resource-acceptance-runner.test.mjs',
  'scripts/ios/ios-content-resource-acceptance-service.test.mjs',
  'scripts/ios/ios-attachment-resource-host-contract.test.mjs',
  'scripts/ios/ios-app-identity-host-contract.test.mjs',
  'scripts/ios/ios-app-icon-host-contract.test.mjs',
  'scripts/ios/ios-acceptance-attempt-evidence.test.mjs',
  'scripts/ios/ios-acceptance-attempts.test.mjs',
  'scripts/ios/ios-acceptance-simulator-identity.test.mjs',
  'scripts/ios/ios-acceptance-restart-runner.test.mjs',
  'scripts/ios/ios-bootstrap-acceptance.test.mjs',
  'scripts/ios/ios-bootstrap-database-path.test.mjs',
  'scripts/ios/ios-sync-group-provider-runner.test.mjs',
  'scripts/ios/ios-database-upgrade-acceptance-runner.test.mjs',
  'scripts/ios/ios-device-anchor-acceptance-runner.test.mjs',
  'scripts/ios/ios-device-anchor-host-contract.test.mjs',
  'scripts/ios/ios-device-profile-acceptance.test.mjs',
  'scripts/ios/ios-foreground-sync-lifecycle-acceptance.test.mjs',
  'scripts/ios/ios-bridge-acceptance-host-contract.test.mjs',
  'scripts/ios/ios-bonjour-discovery-lifecycle-host-contract.test.mjs',
  'scripts/ios/ios-bridge-controller-host-contract.test.mjs',
  'scripts/ios/ios-capacitor-runtime-plugins-contract.test.mjs',
  'scripts/ios/ios-content-blob-host-contract.test.mjs',
  'scripts/ios/ios-desktop-http-security-host-contract.test.mjs',
  'scripts/ios/ios-hosted-acceptance-bucket.test.mjs',
  'scripts/ios/ios-hosted-provider-contract.test.mjs',
  'scripts/ios/ios-local-storage.test.mjs',
  'scripts/ios/ios-active-database-owner-contract.test.mjs',
  'scripts/ios/ios-launch-screen-host-contract.test.mjs',
  'scripts/ios/ios-sync-group-host-contract.test.mjs',
  'scripts/ios/ios-privacy-manifest-host-contract.test.mjs',
  'scripts/ios/ios-resource-profile.test.mjs',
  'scripts/ios/ios-scene-lifecycle-host-contract.test.mjs',
  'scripts/ios/ios-sync-pack-transfer-contract.test.mjs',
  'scripts/ios/ios-state-writeback-acceptance-service.test.mjs',
  'scripts/ios/ios-state-writeback-acceptance-runner.test.mjs',
  'scripts/ios/ios-sync-group-discovery-contract.test.mjs',
  'scripts/ios/ios-sync-group-discovery-acceptance-runner.test.mjs',
  'scripts/ios/ios-sync-group-join-acceptance-runner.test.mjs',
  'scripts/ios/ios-sync-group-provider-contract.test.mjs',
  'scripts/ios/ios-sync-pack-acceptance-runner.test.mjs',
  'scripts/ios/ios-sync-participation-host-contract.test.mjs',
  'scripts/ios/ios-sync-trigger-acceptance-runner.test.mjs',
  'scripts/ios/ios-sync-trigger-host-contract.test.mjs',
];

export const IOS_RUNTIME_SQLITE_CONTRACT_TESTS = [
  'scripts/ios/ios-acceptance-contract-corpus-product.test.mjs',
  'src/companion/companionCaptureTextActions.ios.test.ts',
  'src/companion/companionTrashActions.ios.test.ts',
  'src/shared/platform/companion/runtime/iosCompanionActiveDatabaseWrites.test.ts',
  'src/shared/platform/companionSyncNodeVersions.ios.test.ts'
];

const resourceMode = resolveIosResourceMode();
const vitestTask = iosResourceCommand(process.execPath, [
  'scripts/run-vitest-with-summary.mjs',
  '.tmp/vitest/ios-runtime-contract.json',
  '--',
  '--hookTimeout=30000',
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
  const sqliteTask = {
    command: process.execPath,
    args: [
      'scripts/electron-sqlite-runner.mjs',
      'scripts/test-files.mjs',
      ...IOS_RUNTIME_SQLITE_CONTRACT_TESTS
    ]
  };
  const sqlite = spawnSync(sqliteTask.command, sqliteTask.args, {
    cwd: REPO_ROOT,
    env: iosSqliteVitestEnv(process.env),
    stdio: 'inherit'
  });
  if (sqlite.error) throw sqlite.error;
  if (sqlite.status !== 0) process.exit(sqlite.status ?? 1);

  const cachePaths = prepareIosRuntimeContractCache(REPO_ROOT);
  const nativeTask = iosResourceCommand('swift', [
    'test',
    ...iosSwiftResourceArgs(resourceMode),
    '--disable-sandbox',
    '--package-path', 'ios/App',
    '--scratch-path', cachePaths.scratchPath
  ], resourceMode);
  const native = spawnSync(nativeTask.command, nativeTask.args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: cachePaths.clangModuleCache,
      SWIFTPM_MODULECACHE_OVERRIDE: cachePaths.swiftpmModuleCache
    }
  });
  if (native.error) throw native.error;
  process.exitCode = native.status ?? 1;
}
