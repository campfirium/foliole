/* global console, process, setTimeout */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
  runIosInfrastructureCommand,
  waitForIosBridgeResult
} from './ios-acceptance-infrastructure-error.mjs';
import { iosAcceptanceSimulatorName } from './ios-acceptance-simulator-identity.mjs';
import { prepareIosAcceptanceCache } from './ios-local-storage.mjs';
import { cleanupOwnedIosSimulator, createOwnedIosSimulator } from './ios-dedicated-simulator-runtime.mjs';
import { recordAction, setPhase } from './ios-foreground-sync-lifecycle-evidence.mjs';
import { iosResourceCommand, iosXcodebuildResourceArgs, resolveIosResourceMode } from './ios-resource-profile.mjs';
import { createLifecycleBuildEnv, sanitizeIosAcceptanceEnv } from './ios-foreground-sync-lifecycle-build.mjs';
import {
  startSyncGroupProvider,
  stopSyncGroupProvider,
  waitForSyncGroupProviderReady
} from './ios-sync-group-provider-runner.mjs';
import {
  createSimulatorAcceptanceBuildArgs,
  verifyAcceptanceAppSignature,
  waitForAcceptanceObservation,
  writeAcceptanceFailure
} from './ios-simulator-acceptance-runner.mjs';
import {
  assertForegroundSyncLifecycleRequestPhase,
  verifyForegroundSyncLifecycleAcceptance,
  waitForRecoveredResumeRequest
} from './ios-foreground-sync-lifecycle-snapshot.mjs';
import { waitForForegroundSyncLifecycleSnapshot } from './ios-foreground-sync-lifecycle-state.mjs';

const SCENARIO = 'foreground-sync-lifecycle';
const BUNDLE_ID = 'com.foliole.ios.bootstrap-acceptance';
const DATABASE_RELATIVE_PATH = 'Library/CapacitorDatabase/foliole-companionSQLite.db';
const RESULT_RELATIVE_PATH = 'Library/FolioleBridgeAcceptance/result.json';

export async function runIosForegroundSyncLifecycleAcceptance(
  repoRoot,
  artifactDir = path.join(repoRoot, '.tmp/artifacts/ios-bridge-acceptance', SCENARIO),
  attemptNumber = 1
) {
  const resourceMode = resolveIosResourceMode();
  const options = {
    artifactDir, derivedData: prepareIosAcceptanceCache(repoRoot).derivedData, repoRoot, resourceMode,
    resourceArgs: iosXcodebuildResourceArgs(resourceMode)
  };
  prepareArtifactDirectory(artifactDir);
  let service = null;
  let owned = null;
  try {
    setPhase(options, 'endpoint-ready', 'prepare');
    owned = createOwnedIosSimulator({
      artifactDir, create: (args) => capture(options, 'xcrun', args),
      listAvailable: () => JSON.parse(capture(options, 'xcrun', [
        'simctl', 'list', 'devices', 'available', '--json'
      ])),
      name: iosAcceptanceSimulatorName(SCENARIO, process.pid, attemptNumber)
    });
    const { template, udid } = owned;
    service = startSyncGroupProvider(repoRoot, artifactDir, SCENARIO);
    await waitForSyncGroupProviderReady(service);
    prepareBuild(options, udid);
    bootAndInstall(options, udid);
    const containerPath = resolveContainer(options, udid);
    const resultPath = path.join(containerPath, RESULT_RELATIVE_PATH);
    const databasePath = path.join(containerPath, DATABASE_RELATIVE_PATH);

    launch(options, udid, true);
    await waitForBridge(options, resultPath, (value) => value.phase === 'ready', 'acceptance shell readiness', 60_000);
    await waitForRequestPhase(options, 'endpoint-ready', 1);

    const backgroundDeltas = [];
    let lifecycle = await enterBackground(options, udid, resultPath, backgroundDeltas);
    setPhase(options, 'resume-single-flight', 'foreground');
    launch(options, udid, false);
    lifecycle = await waitForForeground(options, resultPath, lifecycle);
    await waitForRequestPhase(options, 'resume-single-flight', 1);

    lifecycle = await enterBackground(options, udid, resultPath, backgroundDeltas, lifecycle);
    setPhase(options, 'failed-resume', 'foreground');
    launch(options, udid, false);
    lifecycle = await waitForForeground(options, resultPath, lifecycle);
    await waitForRequestPhase(options, 'failed-resume', 1);
    lifecycle = await enterBackground(options, udid, resultPath, backgroundDeltas, lifecycle);

    setPhase(options, 'recovered-resume', 'foreground');
    launch(options, udid, false);
    lifecycle = await waitForForeground(options, resultPath, lifecycle);
    await waitForRecoveredResumeRequest({ read: () => readObservations(options) });
    const beforeRestart = await waitForForegroundSyncLifecycleSnapshot({
      databasePath, repoRoot: options.repoRoot
    });
    await delay(5_500);
    assertForegroundSyncLifecycleRequestPhase(
      readObservations(options).foreground_sync_lifecycle, 'recovered-resume', 1
    );

    run(options, 'xcrun', ['simctl', 'terminate', udid, BUNDLE_ID]);
    rmSync(resultPath, { force: true });
    setPhase(options, 'restart', 'launch');
    launch(options, udid, true);
    await waitForBridge(options, resultPath, (value) => value.phase === 'ready', 'restart shell readiness', 60_000);
    await waitForRequestPhase(options, 'restart', 1);
    const afterRestart = await waitForForegroundSyncLifecycleSnapshot({
      databasePath, previousRunId: beforeRestart.latestFinished.runId, repoRoot: options.repoRoot
    });
    await stopSyncGroupProvider(service);
    service = null;
    const observations = readObservations(options);
    const evidence = { afterRestart, backgroundDeltas, beforeRestart, lifecycle, observations };
    writeFileSync(path.join(artifactDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    const result = verifyForegroundSyncLifecycleAcceptance({
      ...evidence
    });
    const report = { foreground_sync_lifecycle: result, signatureIdentifier: BUNDLE_ID, simulator: { template, udid } };
    writeFileSync(path.join(artifactDir, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    writeAcceptanceFailure(artifactDir, error);
    throw error;
  } finally {
    try {
      if (owned) cleanupSimulator(options, owned.udid);
    } finally {
      if (service) await stopSyncGroupProvider(service);
    }
  }
}

function prepareArtifactDirectory(artifactDir) {
  mkdirSync(artifactDir, { recursive: true });
  for (const name of ['evidence.json', 'failure.json', 'lifecycle-actions.json', 'lifecycle-control.json', 'result.json', 'simulator.log']) {
    rmSync(path.join(artifactDir, name), { force: true });
  }
}

function prepareBuild(options, udid) {
  runHeavy(options, 'npm', ['run', 'android:web:build'], { env: createLifecycleBuildEnv(process.env) });
  run(options, 'npx', ['--no-install', 'cap', 'copy', 'ios']);
  try {
    runHeavy(options, 'xcodebuild', createSimulatorAcceptanceBuildArgs({
      bundleId: BUNDLE_ID, derivedData: options.derivedData, repoRoot: options.repoRoot,
      resourceArgs: options.resourceArgs, udid
    }));
  } finally {
    runHeavy(options, 'npm', ['run', 'android:web:build'], { env: sanitizeIosAcceptanceEnv(process.env) });
    run(options, 'npx', ['--no-install', 'cap', 'copy', 'ios']);
  }
}

function bootAndInstall(options, udid) {
  runIosInfrastructureCommand('simulator-boot', () => {
    run(options, 'xcrun', ['simctl', 'boot', udid]);
    run(options, 'xcrun', ['simctl', 'bootstatus', udid, '-b']);
  });
  const app = path.join(options.derivedData, 'Build/Products/Debug-iphonesimulator/App.app');
  run(options, 'codesign', ['--verify', '--deep', '--strict', app]);
  const signature = verifyAcceptanceAppSignature(captureAllowFailure(options, 'codesign', ['-d', '--verbose=4', app]), BUNDLE_ID);
  if (signature !== BUNDLE_ID) throw new Error('Lifecycle acceptance signature verification failed.');
  run(options, 'xcrun', ['simctl', 'install', udid, app]);
}

async function enterBackground(options, udid, resultPath, deltas, previous = { pause_count: 0 }) {
  const before = readObservations(options).foreground_sync_lifecycle.request_count;
  recordAction(options, 'background', 'launch-settings');
  runAllowFailure(options, 'xcrun', ['simctl', 'terminate', udid, 'com.apple.Preferences']);
  run(options, 'xcrun', ['simctl', 'launch', udid, 'com.apple.Preferences']);
  const lifecycle = await waitForBridge(options, resultPath,
    (value) => value.phase === 'background' && value.pause_count > (previous.pause_count ?? 0), 'Capacitor pause');
  await delay(3_000);
  const after = readObservations(options).foreground_sync_lifecycle.request_count;
  deltas.push(after - before);
  return lifecycle;
}

async function waitForForeground(options, resultPath, previous) {
  return waitForBridge(options, resultPath, (value) => value.phase === 'foreground' &&
    value.active_count > (previous.active_count ?? 0) && value.resume_count > (previous.resume_count ?? 0),
  'paired Capacitor foreground events');
}

async function waitForRequestPhase(options, phase, count) {
  return waitForAcceptanceObservation({
    accept: (value) => value.foreground_sync_lifecycle.phase_requests[phase] === count &&
      value.foreground_sync_lifecycle.active_requests === 0,
    describe: (value) => `${phase} requests=${value.foreground_sync_lifecycle?.phase_requests?.[phase] ?? 0}`,
    initialObservation: `${phase} request was not observed`, label: `${phase} canonical sync pass`,
    read: () => readObservations(options), timeoutMs: 30_000
  });
}

function waitForBridge(options, resultPath, accept, label, timeoutMs = 20_000) {
  return waitForIosBridgeResult({ accept: (value) => value?.status === 'failed' || accept(value),
    describe: (value) => `phase=${value?.phase ?? 'missing'}`,
    initialObservation: `${label} result was not readable`, label,
    resultPath, timeoutMs }).then((value) => {
    if (value?.status === 'failed') throw new Error(value.error || `${label} failed`);
    return value;
  });
}

function readObservations(options) {
  return JSON.parse(readFileSync(path.join(options.artifactDir, 'service-observations.json'), 'utf8'));
}

function launch(options, udid, terminate) {
  recordAction(options, 'acceptance-app', terminate ? 'launch-fresh-process' : 'bring-to-foreground');
  return runIosInfrastructureCommand('app-launch', () =>
    run(options, 'xcrun', ['simctl', 'launch', ...(terminate ? ['--terminate-running-process'] : []), udid, BUNDLE_ID]));
}

function resolveContainer(options, udid) {
  return capture(options, 'xcrun', ['simctl', 'get_app_container', udid, BUNDLE_ID, 'data']).trim();
}

function cleanupSimulator(options, udid) {
  cleanupOwnedIosSimulator({
    artifactDir: options.artifactDir, bundleId: BUNDLE_ID,
    captureLog: (args) => captureAllowFailure(options, 'xcrun', args),
    runAllowFailure: (args) => runAllowFailure(options, 'xcrun', args), udid
  });
}

function runHeavy(options, command, args, extra = {}) {
  const task = iosResourceCommand(command, args, options.resourceMode);
  run(options, task.command, task.args, extra);
}
function capture(options, command, args) {
  const result = spawnSync(command, args, { cwd: options.repoRoot, encoding: 'utf8', timeout: 600_000 });
  if (result.status !== 0) throw new Error([command, ...args, result.error?.message || result.stderr || `failed with ${result.status}`].join(' '));
  return result.stdout;
}
function run(options, command, args, extra = {}) {
  const result = spawnSync(command, args, { cwd: options.repoRoot, stdio: 'inherit', timeout: 600_000, ...extra });
  if (result.status !== 0) throw new Error([command, ...args, result.error?.message || `failed with ${result.status}`].join(' '));
}
function runAllowFailure(options, command, args) { spawnSync(command, args, { cwd: options.repoRoot, stdio: 'ignore', timeout: 600_000 }); }
function captureAllowFailure(options, command, args) {
  const result = spawnSync(command, args, { cwd: options.repoRoot, encoding: 'utf8', timeout: 600_000 });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}
function delay(durationMs) { return new Promise((resolve) => setTimeout(resolve, durationMs)); }
