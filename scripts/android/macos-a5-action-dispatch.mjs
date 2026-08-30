import {
  macosA5ErrorEvidence,
  recoverMacosA5SyncGroupRejoinEntry,
  runMacosA5ClearAppDataEntry,
  runMacosA5ExistingSyncEntry,
  runMacosA5SettledStoppedStatus,
  runMacosA5SyncGroupRejoinEntry
} from './macos-a5-extended-actions.mjs';
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
  if (action === 'build') build(paths);
  if (action === 'status') {
    assertFixed(paths); pairingReadiness(paths); readiness(paths);
  }
  if (action === 'sync-group-stopped-status') {
    await runMacosA5SettledStoppedStatus({ assertFixed: () => assertFixed(paths), checked,
      env, pairingReadiness, paths, readiness, serial });
  }
  if (action === 'deploy') await deploy(paths, buildIdentity, markMutationBoundary, build);
  if (action === 'capture-annotation') {
    await captureAnnotation(paths, buildIdentity, markMutationBoundary, build);
  }
  if (action === 'database-performance') await runMacosA5DatabasePerformanceEntry({
    assertFixed: () => assertFixed(paths), build: () => build(paths), buildIdentity,
    env, execute, markMutationBoundary, paths, serial });
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
  if (action === 'ordinary-journey') {
    await (await import('./android-a5-ordinary-journey-action.mjs'))
      .runMacosA5OrdinaryJourneyEntry(productArgs);
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
