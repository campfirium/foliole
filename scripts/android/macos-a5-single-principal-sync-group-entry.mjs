/* global console, process */

import fs from 'node:fs';
import path from 'node:path';

import { captureA5SyncRun } from './a5-sync-event-proof.mjs';
import { observeA5JourneyFacts } from './a5-journey-facts-proof.mjs';
import { buildA5TwoDeviceAcceptance } from './a5-two-device-build.mjs';
import { writeMacosA5CellReceipt } from './a5-two-device-cell-receipt.mjs';
import { validateA5TwoDeviceJoin } from './a5-two-device-join-evidence.mjs';
import { openMacosSyncGroupDesktopSession,
  waitForMacosAutomaticRun, waitForMacosDeviceRequest
} from './macos-sync-group-desktop-session.mjs';
import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';
import { assertMacosAcceptanceSyncGroupServer } from '../sync-group/multi-device-sync-macos-channel.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import {
  createDesktopSyncConflictSeed, forkDesktopSyncConflict
} from '../desktop/sync-group-conflict-action.mjs';
import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';
import { runMacosA5WindowsTwoDeviceEntry } from './macos-a5-windows-two-device-entry.mjs';
import { verifyMacosA5Restart } from './macos-a5-single-principal-macos-restart.mjs';

const ACCEPTANCE_APP_ID = 'com.foliole.android.acceptance';
const PRODUCT_APP_ID = 'com.foliole.android';
const TEST_CLASS = `${PRODUCT_APP_ID}.FolioleCompanionSyncGroupJoinTest`;

async function waitForMacFact(session) {
  return session.waitForState({ command: 'load_workspace_list_snapshot',
    commandArgs: { includePdfOpenings: false }, condition: {
      counts: { 'Multi-device sync B fact': 1 }, kind: 'fact-prefix-counts'
    }, eventName: 'onWorkspaceSyncApplied', timeoutMs: 2 * 60_000 });
}

async function observeAndAccept(session, options = {}) {
  const request = await waitForMacosDeviceRequest(session, null, options);
  const before = await session.load();
  const previousDeviceIds = new Set(before.sync_group?.devices?.map(
    (device) => device.device_identity_key
  ) ?? []);
  const expectedDeviceCount = (before.sync_group?.devices?.length ?? 0) + 1;
  await session.accept(request.request_id);
  const overview = await session.load();
  if (overview.sync_group?.devices?.length !== expectedDeviceCount) {
    throw new Error('Mac did not persist the fixed A5 as the next Device.');
  }
  const joinedDevice = overview.sync_group.devices.find(
    (device) => !previousDeviceIds.has(device.device_identity_key)
  );
  if (!joinedDevice) throw new Error('Mac did not identify the fixed A5 Device.');
  return { acceptedRequestId: request.request_id,
    deviceCount: overview.sync_group.devices.length,
    deviceId: joinedDevice.device_identity_key, deviceName: request.device_name,
    groupId: overview.sync_group.group_id,
    serverPort: overview.server_status.port };
}

export async function runMacosA5SinglePrincipalSyncGroupEntry(args, dependencies = {}) {
  const mechanics = dependencies.mechanics ?? runMacosA5InstrumentationMechanics;
  const openSession = dependencies.openSession ?? openMacosSyncGroupDesktopSession;
  args.assertFixed();
  const env = buildA5TwoDeviceAcceptance(args);
  const buildIdentity = args.buildIdentity();
  const evidenceRoot = path.join(
    args.paths.artifactsRoot, 'a5-single-principal-sync-group', buildIdentity
  );
  const sharedRoot = process.env.FOLIOLE_T152_ACCEPTANCE_ROOT?.trim() || evidenceRoot;
  fs.mkdirSync(evidenceRoot, { recursive: true });
  if (process.env.FOLIOLE_T152_SYNC_CREATOR === 'windows') {
    return runMacosA5WindowsTwoDeviceEntry({ args, buildIdentity, env, evidenceRoot });
  }
  args.markMutationBoundary?.();
  const macosLibrary = path.join(sharedRoot, 'macos-library');
  if (process.env.FOLIOLE_T152_CELL_ID && fs.existsSync(macosLibrary)) {
    throw new Error('The T152 Mac task library locator was already used.');
  }
  let cellProofInput;
  let session = await openSession({ env, libraryHome: macosLibrary,
    repoRoot: args.paths.buildRoot, runtimeRoot: path.join(sharedRoot, 'macos-runtime') });
  try {
    await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(evidenceRoot, 'desktop-initial-fact'), session });
    const conflictSeed = await createDesktopSyncConflictSeed({
      evidenceRoot: path.join(evidenceRoot, 'conflict-seed'), session
    });
    const providerOverview = assertMacosAcceptanceSyncGroupServer(await session.enable());
    args.checked(args.paths.adb, [
      '-s', args.serial, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'
    ]);
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'wm', 'dismiss-keyguard']);
    const result = await mechanics({ appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot, execute: args.execute, observeConcurrently: true,
      expectedGroupId: providerOverview.sync_group.group_id,
      expectedGroupTag: providerOverview.sync_group.group_tag,
      observeWhileTransportOpen: (options) => observeAndAccept(session, options), paths: args.paths,
      serial: args.serial, testClass: TEST_CLASS,
      validateInstrumentation: (evidence) => validateA5TwoDeviceJoin({ ...evidence, args }) });
    await runMacosA5SyncGroupMaintenance({
      action: 'activate-participation', appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'automatic-enabled'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial
    });
    await observeA5JourneyFacts(args, buildIdentity, env,
      path.join(evidenceRoot, 'initial-union'), { A: 1, B: 1 });
    const a5Initial = await captureA5SyncRun({ args, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'initial-run') }, 'initial');
    const macosBeforeAutomatic = await session.loadSyncTriggerResult();
    const androidFact = await runMacosA5SyncGroupMaintenance({
      action: 'create-journey-fact', appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'android-fact'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial
    });
    const factReceipt = JSON.parse(fs.readFileSync(androidFact.manifestPath, 'utf8')).receipt;
    await waitForMacFact(session);
    const macosAutomaticBeforeRestart = await waitForMacosAutomaticRun(
      session, macosBeforeAutomatic?.run_id
    );
    await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(evidenceRoot, 'desktop-manual-fact'), session });
    await waitForMacFact(session);
    await observeA5JourneyFacts(args, buildIdentity, env,
      path.join(evidenceRoot, 'automatic-union'), { A: 2, B: 2 });
    const a5AutomaticBeforeRestart = await captureA5SyncRun({ args, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'automatic-run') }, 'automatic', [a5Initial.run]);
    await session.invoke('pause_companion_sync');
    await runMacosA5SyncGroupMaintenance({ action: 'pause-participation',
      appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'a5-pause-for-conflict'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial });
    await forkDesktopSyncConflict({ label: 'macos', nodeId: conflictSeed.nodeId, session });
    await runMacosA5SyncGroupMaintenance({ action: 'fork-conflict',
      appId: ACCEPTANCE_APP_ID, buildIdentity, conflictToken: conflictSeed.token, env,
      evidenceRoot: path.join(evidenceRoot, 'a5-conflict-fork'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial });
    await runMacosA5SyncGroupMaintenance({ action: 'resume-participation',
      appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'a5-resume-after-conflict'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial });
    await session.invoke('resume_companion_sync');
    await runMacosA5SyncGroupMaintenance({ action: 'sync-now', appId: ACCEPTANCE_APP_ID,
      buildIdentity, env, evidenceRoot: path.join(evidenceRoot, 'manual-before-restart'),
      execute: args.execute, installMain: false, paths: args.paths, serial: args.serial });
    const a5ManualBeforeRestart = await captureA5SyncRun({ args, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'manual-before-restart-run') }, 'manual');
    const macosManualBeforeRestart = await session.invoke('sync_companion_now');
    const conflicts = await session.waitForState({ command: 'load_sync_node_conflicts',
      commandArgs: { objectIds: [conflictSeed.nodeId] },
      condition: { count: 1, kind: 'sync-conflict-count' },
      eventName: 'onWorkspaceSyncApplied', timeoutMs: 2 * 60_000 });
    const conflict = { conflictCount: conflicts.length, nodeId: conflictSeed.nodeId,
      silentOverwrite: false, visible: true };
    args.checked(args.paths.adb, [
      '-s', args.serial, 'shell', 'am', 'force-stop', ACCEPTANCE_APP_ID
    ]);
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'start', '-W', '-n',
      `${ACCEPTANCE_APP_ID}/${PRODUCT_APP_ID}.MainActivity`]);
    const a5AutomaticAfterRestart = await captureA5SyncRun({ args, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'automatic-after-restart-run') }, 'automatic',
    [a5Initial.run, a5AutomaticBeforeRestart.run]);
    await runMacosA5SyncGroupMaintenance({ action: 'sync-now', appId: ACCEPTANCE_APP_ID,
      buildIdentity, env, evidenceRoot: path.join(evidenceRoot, 'manual-after-restart'),
      execute: args.execute, installMain: false, paths: args.paths, serial: args.serial });
    const a5ManualAfterRestart = await captureA5SyncRun({ args, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'manual-after-restart-run') }, 'manual',
    [a5ManualBeforeRestart.run]);
    const macosRestart = await verifyMacosA5Restart({ env,
      expectedGroupId: result.observation.groupId, openSession,
      repoRoot: args.paths.buildRoot, session, sharedRoot });
    session = macosRestart.session;
    const journeyFacts = await observeA5JourneyFacts(args, buildIdentity, env,
      path.join(evidenceRoot, 'final-union'), { A: 2, B: 2 });
    fs.writeFileSync(path.join(evidenceRoot, 'result.json'), `${JSON.stringify({
      buildIdentity, completedAt: new Date().toISOString(),
      androidFactText: factReceipt.factText, journeyFacts: journeyFacts.facts,
      idempotent: true, journeyOrigins: Object.keys(journeyFacts.counts), macosRestarted: true,
      observation: result.observation,
      conflict,
      runs: { a5: { automaticAfterRestart: a5AutomaticAfterRestart.run,
        automaticBeforeRestart: a5AutomaticBeforeRestart.run, initial: a5Initial.run,
        manualAfterRestart: a5ManualAfterRestart.run,
        manualBeforeRestart: a5ManualBeforeRestart.run }, macos: {
        automaticAfterRestart: macosRestart.automaticRun,
        automaticBeforeRestart: macosAutomaticBeforeRestart,
        manualAfterRestart: macosRestart.manualRun,
        manualBeforeRestart: macosManualBeforeRestart } },
      resultStatus: 'success', sharedRoot
    }, null, 2)}\n`, 'utf8');
    cellProofInput = { automaticBeforeRestartHost: 'macos',
      business: { idempotent: true, twoWayUnion: true }, conflict,
      devices: { a5: { identity: result.observation.deviceId },
        macos: { identity: providerOverview.sync_group.local_device_identity_key } },
      failureLocator: evidenceRoot, groupId: providerOverview.sync_group.group_id,
      groupTag: providerOverview.sync_group.group_tag,
      rawRuns: { a5: { automaticAfterRestart: a5AutomaticAfterRestart.run,
        automaticBeforeRestart: a5AutomaticBeforeRestart.run, initial: a5Initial.run,
        manualAfterRestart: a5ManualAfterRestart.run,
        manualBeforeRestart: a5ManualBeforeRestart.run }, macos: {
        automaticAfterRestart: macosRestart.automaticRun,
        automaticBeforeRestart: macosAutomaticBeforeRestart,
        manualAfterRestart: macosRestart.manualRun,
        manualBeforeRestart: macosManualBeforeRestart } } };
    process.stdout.write(result.output);
  } finally {
    await session.close().catch(() => undefined);
    args.checked(args.paths.adb, ['-s', args.serial, 'uninstall', ACCEPTANCE_APP_ID]);
  }
  if (process.env.FOLIOLE_T152_CELL_ID) {
    writeMacosA5CellReceipt({ buildIdentity, evidenceRoot, input: cellProofInput,
      macosLibrary });
  }
  console.log(`[macos-a5-dev] single-principal-sync-group evidence=${evidenceRoot}`);
}
