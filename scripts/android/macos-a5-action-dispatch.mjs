/* global console */

import {
  macosA5ErrorEvidence,
  recoverMacosA5SyncGroupRejoinEntry,
  runMacosA5ClearAppDataEntry,
  runMacosA5ExistingSyncEntry,
  runMacosA5SettledStoppedStatus,
  runMacosA5SyncGroupRejoinEntry
} from './macos-a5-extended-actions.mjs';
import { buildA5DatabasePerformance } from './a5-database-performance-build.mjs';
import { runMacosA5DatabasePerformanceEntry } from './macos-a5-database-performance-entry.mjs';
import { runMacosA5HiddenDesktopStatusEntry } from './macos-a5-hidden-desktop-status.mjs';
import {
  runMacosA5SyncGroupJoinPrepareEntry
} from './macos-a5-sync-group-join-prepare-entry.mjs';
import { runMacosA5SyncNowEntry } from './macos-a5-sync-now-entry.mjs';

export { macosA5ErrorEvidence };

export async function dispatchMacosA5Action({
  action, assertFixed, build, buildIdentity, captureAnnotation, captured, checked, deploy,
  env, execute, markMutationBoundary, pairingReadiness, paths, protectData, readiness, serial
}) {
  if (action === 'build') {
    if (env.FOLIOLE_DATABASE_PERFORMANCE_SCENARIO) buildA5DatabasePerformance({ checked, captured, env, paths });
    else build(paths);
  }
  if (action === 'status') {
    assertFixed(paths); pairingReadiness(paths); readiness(paths);
  }
  if (action === 's220-package-inventory') {
    const { inspectS220A5Packages } = await import('./macos-a5-s220-package-inventory.mjs');
    const { filePath, receipt } = await inspectS220A5Packages({ assertFixed: () => assertFixed(paths),
      execute, paths, serial });
    console.log(`[macos-a5-dev] S220 package inventory=${filePath} available=${receipt.s220PackageAvailable}`);
  }
  if (action === 's220-upgrade') {
    const { upgradeS220A5Package } = await import('./macos-a5-s220-upgrade.mjs');
    await upgradeS220A5Package({ assertFixed: () => assertFixed(paths), captured, checked,
      env, execute, markMutationBoundary, paths, serial });
  }
  if (action === 's220-upgrade-test') {
    const { upgradeS220A5TestPackage } = await import('./macos-a5-s220-upgrade.mjs');
    await upgradeS220A5TestPackage({ assertFixed: () => assertFixed(paths), captured, checked,
      env, execute, markMutationBoundary, paths, serial });
  }
  if (action === 's220-offline-test-upgrade') {
    const { upgradeS220A5TestPackage } = await import('./macos-a5-s220-upgrade.mjs');
    await upgradeS220A5TestPackage({ assertFixed: () => assertFixed(paths), captured,
      checked, env, execute, markMutationBoundary, paths, phase: 'offline', serial });
  }
  if (action === 's220-resource-test-upgrade') {
    const { upgradeS220A5TestPackage } = await import('./macos-a5-s220-upgrade.mjs');
    await upgradeS220A5TestPackage({ assertFixed: () => assertFixed(paths), captured,
      checked, env, execute, markMutationBoundary, paths, phase: 'resource', serial });
  }
  if (action === 's220-final-test-upgrade') {
    const { upgradeS220A5TestPackage } = await import('./macos-a5-s220-upgrade.mjs');
    await upgradeS220A5TestPackage({ assertFixed: () => assertFixed(paths), captured,
      checked, env, execute, markMutationBoundary, paths, phase: 'final', serial });
  }
  if (action === 's220-main-compare') {
    const { compareS220A5Main } = await import('./macos-a5-s220-main-compare.mjs');
    const result = await compareS220A5Main({ assertFixed: () => assertFixed(paths),
      env, execute, paths, serial });
    console.log(`[macos-a5-dev] S220 main comparison=${result.filePath} preserved=${result.preserved}`);
  }
  if (action === 's220-offline') {
    const { runS220A5Offline } = await import('./macos-a5-s220-offline.mjs');
    await runS220A5Offline({ assertFixed: () => assertFixed(paths), captured, checked,
      env, execute, paths, serial });
  }
  if (action === 's220-final-fixture') {
    const { seedS220FinalFixture } = await import('./macos-a5-s220-final-fixture.mjs');
    await seedS220FinalFixture({ assertFixed: () => assertFixed(paths), buildIdentity,
      env, execute, paths, serial });
  }
  if (action === 's220-offline-edit') {
    const { runS220A5OfflineEdit } = await import('./macos-a5-s220-offline-edit.mjs');
    await runS220A5OfflineEdit({ assertFixed: () => assertFixed(paths), captured,
      checked, env, execute, paths, serial });
  }
  if (action === 's220-converge') {
    const { convergeS220A5 } = await import('./macos-a5-s220-converge.mjs');
    await convergeS220A5({ assertFixed: () => assertFixed(paths), buildIdentity,
      env, execute, paths, serial });
  }
  if (action === 's220-resource-verify') {
    const { verifyS220A5Resource } = await import('./macos-a5-s220-resource-verify.mjs');
    await verifyS220A5Resource({ assertFixed: () => assertFixed(paths), buildIdentity,
      captured, checked, env, execute, paths, serial });
  }
  if (action === 's220-resource-diagnostic') {
    const { diagnoseS220A5Resource } = await import('./macos-a5-s220-resource-diagnostic.mjs');
    await diagnoseS220A5Resource({ assertFixed: () => assertFixed(paths), buildIdentity,
      env, execute, paths, serial });
  }
  if (action === 's220-group-inspect') {
    const { inspectS220A5Group } = await import('./macos-a5-s220-group-inspect.mjs');
    const filePath = await inspectS220A5Group({ assertFixed: () => assertFixed(paths),
      paths, serial });
    console.log(`[macos-a5-dev] S220 group inspection=${filePath}`);
  }
  if (action === 's220-network-status') {
    const { inspectS220A5Network } = await import('./macos-a5-s220-network-status.mjs');
    const filePath = await inspectS220A5Network({ assertFixed: () => assertFixed(paths),
      execute, paths, serial });
    console.log(`[macos-a5-dev] S220 network status=${filePath}`);
  }
  if (action === 'sync-group-stopped-status') {
    await runMacosA5SettledStoppedStatus({ assertFixed: () => assertFixed(paths), checked,
      env, pairingReadiness, paths, readiness, serial });
  }
  if (action === 'deploy') await deploy(paths, buildIdentity, markMutationBoundary, build);
  if (action === 'capture-annotation') {
    await captureAnnotation(paths, buildIdentity, markMutationBoundary, build);
  }
  if (action === 'image-contract') {
    const { runMacosA5ImageContractEntry } = await import('./macos-a5-image-contract-entry.mjs');
    await runMacosA5ImageContractEntry({ assertFixed: () => assertFixed(paths),
      build: () => build(paths), buildIdentity, checked, env, execute, markMutationBoundary,
      pairingReadiness, paths, protectData, readiness, serial });
  }
  if (action === 'database-performance') await runMacosA5DatabasePerformanceEntry({
    assertFixed: () => assertFixed(paths), buildIdentity, checked, captured,
    env, execute, markMutationBoundary, paths, serial });
  if (action === 't234-webview-session') {
    const { runT234WebViewSession } = await import('./macos-a5-t234-webview-session.mjs');
    await runT234WebViewSession({ assertFixed: () => assertFixed(paths), buildIdentity,
      captured, checked, paths, serial });
  }
  if (action === 'device-profile') {
    const { runMacosA5DeviceProfileEntry } = await import('./macos-a5-device-profile-action.mjs');
    await runMacosA5DeviceProfileEntry({
      assertFixed: () => assertFixed(paths), build: () => build(paths), buildIdentity,
      captured, checked, markMutationBoundary, paths, protectData, serial
    });
  }
  if (action === 'hidden-desktop-status') await runMacosA5HiddenDesktopStatusEntry({
    build, buildIdentity, checked, env, paths
  });
  const productArgs = {
    assertFixed: () => assertFixed(paths), build: () => build(paths), buildIdentity,
    checked, env, execute, markMutationBoundary, paths, protectData, serial
  };
  if (action === 'mobile-link') {
    await (await import('./macos-a5-mobile-link-entry.mjs')).runMacosA5MobileLinkEntry(productArgs);
  }
  if (action === 'resource-provider-contract') {
    await (await import('./macos-a5-resource-provider-entry.mjs')).runMacosA5ResourceProviderEntry(productArgs);
  }
  if (action === 'pair-credentials') {
    await (await import('./macos-a5-pair-credentials-action.mjs'))
      .runMacosA5PairCredentialsEntry(productArgs);
  }
  if (action === 'leave-sync-group') {
    await (await import('./macos-a5-leave-sync-group-entry.mjs'))
      .runMacosA5LeaveSyncGroupEntry(productArgs);
  }
  if (action === 'clear-app-data') await runMacosA5ClearAppDataEntry(productArgs);
  if (action === 'system-entry-sync') {
    await (await import('./macos-a5-system-entry-sync-action.mjs'))
      .runMacosA5SystemEntrySyncEntry(productArgs);
  }
  if (action === 'sync-existing') await runMacosA5ExistingSyncEntry(productArgs);
  if (action === 'sync-now') await runMacosA5SyncNowEntry(productArgs);
  if (action === 'sync-group-join-prepare') {
    await runMacosA5SyncGroupJoinPrepareEntry(productArgs);
  }
  if (action === 'single-principal-sync-group') {
    await (await import('./macos-a5-single-principal-sync-group-entry.mjs'))
      .runMacosA5SinglePrincipalSyncGroupEntry(productArgs);
  }
  if (action === 'sync-group-rejoin') await runMacosA5SyncGroupRejoinEntry(productArgs);
  if (action === 'sync-group-rejoin-recover') {
    await recoverMacosA5SyncGroupRejoinEntry(productArgs);
  }
}
