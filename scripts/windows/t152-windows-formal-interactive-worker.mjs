#!/usr/bin/env node
/* global clearTimeout, console, process, setTimeout, URL */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertT152DesktopDnsSdIsolation, verifyT152DesktopDnsSdLibrary } from
  '../desktop/t152-desktop-dnssd-library.mjs';
import { formalLaunchEnvHash, reconstructFormalPaths, validateFormalInteractiveRequest } from
  './t152-windows-formal-interactive-contract.mjs';
import { runT152WindowsAnchorAdmission } from './t152-windows-prejourney-anchor.mjs';

function samePath(left, right) {
  return path.win32.normalize(left).toLowerCase() === path.win32.normalize(right).toLowerCase();
}

function actionReceipt(actionResult, evidenceRoot) {
  const manifestPath = Object.values(actionResult ?? {}).find((value) =>
    typeof value?.manifestPath === 'string')?.manifestPath;
  if (!manifestPath || !path.win32.isAbsolute(manifestPath)) {
    throw new Error('Fixed product action receipt is missing.');
  }
  const relative = path.win32.relative(evidenceRoot, manifestPath);
  if (relative === '..' || relative.startsWith(`..${path.win32.sep}`)
      || path.win32.isAbsolute(relative)) throw new Error('Fixed product receipt escaped evidence.');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function readRequest(stateRoot) {
  if (!path.win32.isAbsolute(stateRoot ?? '')) throw new Error('T152 state root is required.');
  return JSON.parse(fs.readFileSync(path.win32.join(stateRoot, 'request.json'), 'utf8'));
}

async function productModules(sourceRoot) {
  const sourceUrl = pathToFileURL(path.win32.join(sourceRoot, 'scripts', 'windows'));
  return Promise.all([
    import(new URL('./windows-client-native-interactive-state.mjs', `${sourceUrl.href}/`)),
    import(new URL('./windows-dev-paths.mjs', `${sourceUrl.href}/`)),
    import(new URL('./windows-multi-device-sync-readiness.mjs', `${sourceUrl.href}/`)),
    import(new URL('./windows-sync-group-recovery-action.mjs', `${sourceUrl.href}/`)),
    import(new URL('./windows-sync-group-session-close.mjs', `${sourceUrl.href}/`)),
    import(new URL('./windows-sync-group-device-actions.mjs', `${sourceUrl.href}/`)),
    import(new URL('./windows-bounded-process.mjs', `${sourceUrl.href}/`)),
    import(new URL('./windows-sync-group-interactive-state.mjs', `${sourceUrl.href}/`)),
    import(new URL('../acceptance/desktop-product-event.mjs', `${sourceUrl.href}/`)),
    import(new URL('../desktop/desktop-dnssd-identity-preflight.mjs', `${sourceUrl.href}/`))
  ]);
}

function waitForRelease(filePath) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => finish(new Error('G4 provider release timed out.')),
      12 * 60_000);
    const finish = (error, value) => {
      clearTimeout(deadline); watcher.close();
      if (error) reject(error); else resolve(value);
    };
    const inspect = () => {
      if (!fs.existsSync(filePath)) return;
      try {
        const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (value?.schemaVersion !== 1 || value.status !== 'consumer_complete') {
          throw new Error('G4 provider release is invalid.');
        }
        finish(null, value);
      } catch (error) { finish(error); }
    };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const watcher = fs.watch(path.dirname(filePath), inspect);
    inspect();
  });
}

function verifyProjection(request, owner, paths, readiness, recovery) {
  const client = recovery.windowsSyncGroupClientPaths(paths);
  if (!samePath(client.libraryHome, owner.libraryRoot)
      || !samePath(client.userData, owner.userDataRoot)) {
    throw new Error('Fixed product paths diverged from the T152 owner.');
  }
  readiness.provisionWindowsAcceptanceRoot({ paths });
  const fallbackRoot = readiness.windowsAcceptanceRoot({ ...paths, acceptanceRepoRoot: undefined });
  if (fs.existsSync(fallbackRoot)) throw new Error('Capsule-source fallback runtime exists.');
  const databasePath = path.win32.join(owner.libraryRoot, 'Data', 'foliole.db');
  if (fs.existsSync(databasePath)) throw new Error('Task-owned database exists before G3.');
  return { acceptanceRepoRoot: paths.acceptanceRepoRoot, fallbackRoot,
    fallbackRootExists: false, libraryRoot: client.libraryHome, databasePath,
    databaseExists: false,
    ownerMarker: path.win32.join(readiness.windowsAcceptanceRoot(paths), 'acceptance-owner.json'),
    sourceRoot: paths.repoRoot, userDataRoot: client.userData };
}

async function runPhase(request, modules, owner, reportProgress) {
  const [, pathsModule, readiness, recovery, closeOwner, actions, bounded, syncState,
    productEvent, identityOwner] = modules;
  const paths = reconstructFormalPaths(request, pathsModule.windowsDevPaths);
  const projection = verifyProjection(request, owner, paths, readiness, recovery);
  if (request.phase === 'g2-path') return { projection, productStarted: false };
  if (request.phase === 'g3-anchor') {
    const anchor = await runT152WindowsAnchorAdmission({
      closeSession: closeOwner.closeWindowsSyncGroupSession, evidenceRoot: request.evidenceRoot,
      invokeCommand: recovery.invokeWindowsSyncGroupCommand,
      openSession: recovery.openWindowsSyncGroupSession, owner, paths
    });
    return { anchor, productStarted: true, projection };
  }
  if (request.action === 't152-desktop-dnssd-find-checkpoint') {
    const session = await recovery.openWindowsSyncGroupSession(paths, request.evidenceRoot);
    let candidate;
    try {
      await recovery.invokeWindowsSyncGroupCommand(session.page, 'enable_companion_sync');
      const overview = await productEvent.waitForDesktopProductState(session.page, {
        command: 'load_sync_group_overview', condition: { groupId: request.expectedGroupId,
          groupTag: request.expectedGroupTag, kind: 'candidate-identity' },
        eventName: 'onSyncGroupDiscoveryChanged', timeoutMs: 2 * 60_000,
        triggerCommand: 'discover_sync_groups' });
      const matches = overview.join_candidates.filter((value) =>
        value.group_id === request.expectedGroupId
          && value.group_tag === request.expectedGroupTag
          && value.provider_device_id === request.expectedProviderDeviceId);
      if (matches.length !== 1) throw new Error('G4b1 product candidate was not unique.');
      [candidate] = matches;
      await recovery.invokeWindowsSyncGroupCommand(session.page, 'stop_discover_sync_groups');
    } finally { await closeOwner.closeWindowsSyncGroupSession(session); }
    return { candidate: { groupId: candidate.group_id, groupTag: candidate.group_tag,
      providerDeviceId: candidate.provider_device_id, providerPlatform: candidate.provider_platform },
    httpDiscoveryCrossChecked: true, productStarted: true, protocolCompatible: true,
    requestSent: false };
  }
  if (request.action === 't152-desktop-dnssd-advertise-checkpoint') {
    const session = await recovery.openWindowsSyncGroupSession(paths, request.evidenceRoot);
    try {
      const group = (await recovery.invokeWindowsSyncGroupCommand(
        session.page, 'create_sync_group')).sync_group;
      const preflight = await identityOwner.loadDesktopDnsSdIdentityPreflight(
        session.app, group?.group_id);
      const identityKey = group?.local_device_identity_key;
      const bytes = await identityOwner.validateDesktopDnsSdIdentity(session.app, identityKey);
      if (identityKey !== preflight.identityKey || bytes !== preflight.deviceIdTxtEntryBytes
          || !/^[0-9a-f]{32}$/u.test(group?.group_tag ?? '')) {
        throw new Error('Windows formal advertisement identity is invalid.');
      }
      reportProgress({ deviceId: identityKey, factId: request.action,
        groupId: group.group_id, groupTag: group.group_tag, milestone: 'provider-ready' });
      await waitForRelease(path.win32.join(request.stateRoot, 'provider-release.json'));
      return { deviceId: identityKey, deviceIdTxtEntryBytes: bytes,
        groupId: group.group_id, groupTag: group.group_tag,
        libraryPath: preflight.canonicalLibraryPath, productStarted: true };
    } finally { await closeOwner.closeWindowsSyncGroupSession(session); }
  }
  const actionResult = await actions.runWindowsSyncGroupDeviceAction({ action: request.action,
    buildIdentity: request.buildIdentity, evidenceRoot: request.evidenceRoot,
    execute: bounded.executeBounded, expectedGroupId: request.expectedGroupId,
    expectedGroupTag: request.expectedGroupTag, paths,
    reportProgress: (value) => reportProgress(
      syncState.validateSyncGroupInteractiveProgress(value, request.action)) });
  return { actionReceipt: actionReceipt(actionResult, request.evidenceRoot),
    actionResult, productStarted: true };
}

async function main() {
  const stateRoot = process.argv[2];
  const request = validateFormalInteractiveRequest(readRequest(stateRoot));
  if (!samePath(stateRoot, request.stateRoot)) throw new Error('T152 state root changed.');
  const modules = await productModules(request.sourceRoot);
  const state = modules[0].interactiveStatePaths(stateRoot);
  const owner = verifyT152DesktopDnsSdLibrary({ baseRoot: request.baseRoot,
    evidenceRoot: request.evidenceRoot, rootId: request.rootId, sourceRoot: request.sourceRoot },
  request.ownerReceipt, { pathApi: path.win32 });
  if (request.launchEnvHash !== formalLaunchEnvHash({ sourceRoot: request.sourceRoot,
    stateRoot: request.stateRoot, taskRoot: owner.taskRoot })) {
    throw new Error('T152 launch environment changed.');
  }
  assertT152DesktopDnsSdIsolation(owner, request.protectedRoots, { pathApi: path.win32 });
  const progress = [];
  const running = { nonce: request.nonce, progress, schemaVersion: 2,
    startedAt: new Date().toISOString(), state: 'running', workerPid: process.pid };
  modules[0].writeJsonAtomic(state.status, running);
  let terminal;
  try {
    const result = await runPhase(request, modules, owner, (value) => {
      progress.push(value); modules[0].writeJsonAtomic(state.status, running);
    });
    const receipt = { action: request.action, completedAt: new Date().toISOString(),
      formalAttempt: request.formalAttempt, ownerHash: owner.ownerHash, phase: request.phase,
      productCommit: request.productCommit, result, resultStatus: 'success', rootId: request.rootId,
      progress, schemaVersion: 2 };
    const receiptPath = path.win32.join(request.evidenceRoot, `${request.phase}-receipt.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    terminal = { exitCode: 0, nonce: request.nonce, receiptPath, schemaVersion: 2,
      state: 'completed', workerPid: process.pid };
  } catch (error) {
    terminal = { error: error instanceof Error ? error.message : String(error), exitCode: 1,
      nonce: request.nonce, schemaVersion: 2, state: 'completed', workerPid: process.pid };
  }
  terminal.completedAt = new Date().toISOString();
  modules[0].writeJsonAtomic(state.result, terminal);
  modules[0].writeJsonAtomic(state.status, terminal);
  process.exitCode = terminal.exitCode;
}

process.env.FOLIOLE_SYNC_GROUP_INTERACTIVE_WORKER = '1';
process.env.FOLIOLE_NATIVE_CLIENT_INTERACTIVE_WORKER = '1';
main().catch((error) => {
  console.error(`[t152-windows-formal-worker] ${error.message}`);
  process.exitCode = 1;
});
