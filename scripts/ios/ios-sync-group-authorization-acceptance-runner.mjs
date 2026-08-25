/* global console, process */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { cleanupOwnedIosSimulator, createOwnedIosSimulator } from './ios-dedicated-simulator-runtime.mjs';
import { iosResourceCommand, iosXcodebuildResourceArgs, resolveIosResourceMode } from './ios-resource-profile.mjs';
import {
  createSimulatorAcceptanceBuildArgs,
  verifyAcceptanceAppSignature,
  waitForAcceptanceObservation,
  writeAcceptanceFailure
} from './ios-simulator-acceptance-runner.mjs';

const SCENARIO = 'sync-group-authorization';
const BUNDLE_ID = 'com.foliole.ios.bootstrap-acceptance';
const RESULT_RELATIVE_PATH = 'Library/FolioleBridgeAcceptance/result.json';
const ACCEPTANCE_ENV_KEYS = [
  'VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE', 'VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT',
  'VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO'
];

export async function runIosSyncGroupAuthorizationAcceptance(repoRoot, artifactDir) {
  mkdirSync(artifactDir, { recursive: true });
  const options = { artifactDir, derivedData: path.join(artifactDir, 'DerivedData'),
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
    const signatureIdentifier = verifyAcceptanceAppSignature(
      captureAllowFailure(options, 'codesign', ['-d', '--verbose=4', app]), BUNDLE_ID);
    run(options, 'xcrun', ['simctl', 'install', owned.udid, app]);
    const container = capture(options, 'xcrun',
      ['simctl', 'get_app_container', owned.udid, BUNDLE_ID, 'data']).trim();
    const resultPath = path.join(container, RESULT_RELATIVE_PATH);
    const first = await waitForPhase(options, owned.udid, resultPath, 'route-saved');
    const second = await waitForPhase(options, owned.udid, resultPath, 'route-restarted');
    verifyResults(first, second);
    const receipt = { accepted_tip: revision, first, second,
      signature_identifier: signatureIdentifier, simulator: owned, status: 'passed' };
    writeFileSync(path.join(artifactDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify(receipt, null, 2));
    return receipt;
  } catch (error) {
    writeAcceptanceFailure(artifactDir, error);
    throw error;
  } finally {
    try { restoreOrdinaryAssets(options); } finally {
      if (owned) cleanupOwnedIosSimulator({ artifactDir, bundleId: BUNDLE_ID,
        captureLog: (args) => captureAllowFailure(options, 'xcrun', args),
        runAllowFailure: (args) => runAllowFailure(options, 'xcrun', args), udid: owned.udid });
    }
  }
}

function waitForPhase(options, udid, resultPath, phase) {
  return waitForAcceptanceObservation({
    accept: (value) => value?.phase === phase || value?.status === 'failed',
    action: () => run(options, 'xcrun', ['simctl', 'launch', '--terminate-running-process', udid, BUNDLE_ID]),
    describe: (value) => `authorization phase=${value?.phase ?? 'missing'}`,
    initialObservation: 'authorization result was not readable', label: `signed iOS ${phase}`,
    read: () => JSON.parse(readFileSync(resultPath, 'utf8')), timeoutMs: 180_000
  });
}

function verifyResults(first, second) {
  if (first?.status !== 'passed' || second?.status !== 'passed' ||
      first.signature !== second.signature || first.legacy_pairing_preserved !== true ||
      second.legacy_pairing_preserved !== true || second.revoked !== true ||
      second.route_removed !== true || second.signing_rejected_after_revoke !== true) {
    throw new Error(first?.error || second?.error || 'iOS authorization acceptance evidence is incomplete.');
  }
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
    throw new Error('iOS authorization acceptance requires a clean tracked worktree.');
  }
  const revision = capture(options, 'git', ['rev-parse', 'HEAD']).trim();
  if (revision !== capture(options, 'git', ['rev-parse', 'origin/dev']).trim()) {
    throw new Error('iOS authorization acceptance requires HEAD == origin/dev.');
  }
  return revision;
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
