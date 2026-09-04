/* global console, process */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createSyncGroupDeviceIdentity, isSameSyncGroupDevice } from '../../lib/platform/syncGroupUnifiedContract.ts';
import { cleanupOwnedIosSimulator, createOwnedIosSimulator } from './ios-dedicated-simulator-runtime.mjs';
import { prepareIosAcceptanceCache } from './ios-local-storage.mjs';
import { iosResourceCommand, iosXcodebuildResourceArgs, resolveIosResourceMode } from './ios-resource-profile.mjs';
import {
  createSimulatorAcceptanceBuildArgs,
  verifyAcceptanceAppSignature,
  waitForAcceptanceObservation,
  writeAcceptanceFailure
} from './ios-simulator-acceptance-runner.mjs';

const SCENARIO = 'device-identity';
const GROUP_ID = 'group-t152-device-anchor-acceptance';
const OTHER_ANCHOR = '22222222-2222-4222-8222-222222222222';
const BUNDLE_ID = 'com.foliole.ios.bootstrap-acceptance';
const RESULT_RELATIVE_PATH = 'Library/FolioleBridgeAcceptance/result.json';
const ACCEPTANCE_ENV_KEYS = [
  'VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE', 'VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT',
  'VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO'
];

export async function runIosDeviceAnchorAcceptance(repoRoot, artifactDir) {
  mkdirSync(artifactDir, { recursive: true });
  const options = { artifactDir, derivedData: prepareIosAcceptanceCache(repoRoot).derivedData,
    repoRoot, resourceMode: resolveIosResourceMode() };
  const revision = assertFrozenRevision(options);
  let owned = null;
  try {
    owned = createOwnedIosSimulator({
      artifactDir, create: (args) => capture(options, 'xcrun', args),
      listAvailable: () => runJson(options, 'xcrun', ['simctl', 'list', 'devices', 'available', '--json']),
      name: `Foliole ${SCENARIO} ${process.pid}`
    });
    prepareApp(options, owned.udid);
    run(options, 'xcrun', ['simctl', 'boot', owned.udid]);
    run(options, 'xcrun', ['simctl', 'bootstatus', owned.udid, '-b']);
    const app = path.join(options.derivedData, 'Build/Products/Debug-iphonesimulator/App.app');
    run(options, 'codesign', ['--verify', '--deep', '--strict', app]);
    const signature = verifyAcceptanceAppSignature(
      captureAllowFailure(options, 'codesign', ['-d', '--verbose=4', app]), BUNDLE_ID);
    run(options, 'xcrun', ['simctl', 'install', owned.udid, app]);
    const initialResultPath = resolveResultPath(options, owned.udid);
    const first = await launchAndRead(options, owned.udid, initialResultPath, 'initial');
    writeObservation(artifactDir, 'initial', first);
    run(options, 'xcrun', ['simctl', 'terminate', owned.udid, BUNDLE_ID]);
    rmSync(initialResultPath, { force: true });
    run(options, 'xcrun', ['simctl', 'install', owned.udid, app]);
    const upgradedResultPath = resolveResultPath(options, owned.udid);
    const second = await launchAndRead(options, owned.udid, upgradedResultPath, 'upgrade-restart');
    writeObservation(artifactDir, 'upgrade-restart', second);
    const separation = verifyIosDeviceAnchorAcceptance(first, second);
    const receipt = { accepted_tip: revision, first, second, separation,
      signature_identifier: signature, simulator: owned, status: 'passed' };
    writeFileSync(path.join(artifactDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify(receipt, null, 2));
    return receipt;
  } catch (error) {
    writeAcceptanceFailure(artifactDir, error);
    throw error;
  } finally {
    try { restoreOrdinaryAssets(options); } finally {
      if (owned) cleanupOwned(options, owned.udid);
    }
  }
}

export function verifyIosDeviceAnchorAcceptance(first, second) {
  for (const result of [first, second]) {
    if (result?.status !== 'passed' || result?.scenario !== SCENARIO ||
        result?.phase !== 'anchor-observed') {
      throw new Error(result?.error || 'iOS device anchor acceptance evidence is incomplete.');
    }
    if (result.anchor_storage !== 'keychain-after-first-unlock-this-device-only' ||
        !hasCanonicalSandboxPathEvidence(result)) {
      throw new Error('iOS device anchor storage or canonical path evidence is incomplete.');
    }
  }
  const initial = identity(first.device_anchor, first.canonical_database_path);
  const restarted = identity(second.device_anchor, second.canonical_database_path);
  const moved = identity(first.device_anchor, `${first.canonical_database_path}.copy`);
  const otherDevice = identity(OTHER_ANCHOR, first.canonical_database_path);
  if (first.device_anchor !== second.device_anchor) {
    throw new Error('iOS device anchor did not persist across upgrade restart.');
  }
  if (first.canonical_database_path !== second.canonical_database_path) {
    throw new Error('iOS canonical database path changed across upgrade restart.');
  }
  if (!isSameSyncGroupDevice(initial, restarted) || isSameSyncGroupDevice(initial, moved) ||
      isSameSyncGroupDevice(initial, otherDevice)) {
    throw new Error('iOS Device identity did not persist or separate path/device changes.');
  }
  return { moved_identity_key: moved.identity_key, other_device_identity_key: otherDevice.identity_key };
}

function hasCanonicalSandboxPathEvidence(result) {
  const databasePath = result.database_path;
  const canonicalPath = result.canonical_database_path;
  return typeof databasePath === 'string' && typeof canonicalPath === 'string' &&
    path.posix.isAbsolute(databasePath) && path.posix.isAbsolute(canonicalPath) &&
    canonicalPath !== '/' && path.posix.normalize(canonicalPath) === canonicalPath &&
    databasePath.endsWith(canonicalPath);
}

function writeObservation(artifactDir, label, value) {
  writeFileSync(path.join(artifactDir, `${label}-result.json`), `${JSON.stringify(value, null, 2)}\n`);
}

function identity(deviceAnchor, libraryPath) {
  return createSyncGroupDeviceIdentity({
    device_anchor: deviceAnchor, group_id: GROUP_ID, library_path: libraryPath, path_flavor: 'posix'
  });
}

function resolveResultPath(options, udid) {
  const container = capture(options, 'xcrun',
    ['simctl', 'get_app_container', udid, BUNDLE_ID, 'data']).trim();
  return path.join(container, RESULT_RELATIVE_PATH);
}

function launchAndRead(options, udid, resultPath, label) {
  return waitForAcceptanceObservation({
    accept: (value) => value?.status === 'passed' || value?.status === 'failed',
    action: () => run(options, 'xcrun', ['simctl', 'launch', '--terminate-running-process', udid, BUNDLE_ID]),
    describe: (value) => `${label} status=${value?.status ?? 'missing'}`,
    initialObservation: `${label} device anchor result was not readable`, label: `signed iOS ${label} device anchor`,
    read: () => JSON.parse(readFileSync(resultPath, 'utf8')), timeoutMs: 180_000
  });
}

function prepareApp(options, udid) {
  runHeavy(options, 'npm', ['run', 'android:web:build'], { env: acceptanceBuildEnv(process.env) });
  run(options, 'npx', ['--no-install', 'cap', 'copy', 'ios']);
  runHeavy(options, 'xcodebuild', createSimulatorAcceptanceBuildArgs({
    bundleId: BUNDLE_ID, derivedData: options.derivedData, repoRoot: options.repoRoot,
    resourceArgs: iosXcodebuildResourceArgs(options.resourceMode), udid
  }));
}

function restoreOrdinaryAssets(options) {
  runHeavy(options, 'npm', ['run', 'android:web:build'], { env: ordinaryBuildEnv(process.env) });
  run(options, 'npx', ['--no-install', 'cap', 'copy', 'ios']);
}

export function acceptanceBuildEnv(env) {
  return { ...ordinaryBuildEnv(env), VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1',
    VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: SCENARIO };
}

export function ordinaryBuildEnv(env) {
  const sanitized = { ...env };
  for (const key of ACCEPTANCE_ENV_KEYS) delete sanitized[key];
  return sanitized;
}

function assertFrozenRevision(options) {
  if (capture(options, 'git', ['status', '--porcelain', '--untracked-files=no']).trim()) {
    throw new Error('iOS device anchor acceptance requires a clean tracked worktree.');
  }
  const revision = capture(options, 'git', ['rev-parse', 'HEAD']).trim();
  if (revision !== capture(options, 'git', ['rev-parse', 'origin/dev']).trim()) {
    throw new Error('iOS device anchor acceptance requires HEAD == origin/dev.');
  }
  return revision;
}

function cleanupOwned(options, udid) {
  cleanupOwnedIosSimulator({ artifactDir: options.artifactDir, bundleId: BUNDLE_ID,
    captureLog: (args) => captureAllowFailure(options, 'xcrun', args),
    runAllowFailure: (args) => runAllowFailure(options, 'xcrun', args), udid });
}

function runHeavy(options, command, args, extra = {}) {
  const task = iosResourceCommand(command, args, options.resourceMode);
  run(options, task.command, task.args, extra);
}
function runJson(options, command, args) { return JSON.parse(capture(options, command, args)); }
function capture(options, command, args) {
  const result = spawnSync(command, args, { cwd: options.repoRoot, encoding: 'utf8', timeout: 600_000 });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed with ${result.status}`);
  return result.stdout;
}
function run(options, command, args, extra = {}) {
  const result = spawnSync(command, args, { cwd: options.repoRoot, stdio: 'inherit', timeout: 600_000, ...extra });
  if (result.status !== 0) throw new Error(`${command} failed with ${result.status}`);
}
function runAllowFailure(options, command, args) {
  spawnSync(command, args, { cwd: options.repoRoot, stdio: 'ignore', timeout: 600_000 });
}
function captureAllowFailure(options, command, args) {
  const result = spawnSync(command, args, { cwd: options.repoRoot, encoding: 'utf8', timeout: 600_000 });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}
