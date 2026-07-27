/* global console, process, setTimeout */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { iosResourceCommand, iosXcodebuildResourceArgs, resolveIosResourceMode } from './ios-resource-profile.mjs';
import { createLifecycleBuildEnv, sanitizeIosAcceptanceEnv } from './ios-foreground-sync-lifecycle-build.mjs';
import { startPairingAcceptanceService } from './ios-pairing-acceptance-runner.mjs';
import {
  createSimulatorAcceptanceBuildArgs,
  verifyAcceptanceAppSignature,
  waitForAcceptanceObservation,
  writeAcceptanceFailure
} from './ios-simulator-acceptance-runner.mjs';
import {
  createDedicatedSimulatorArgs,
  dedicatedSimulatorCleanupArgs,
  selectDedicatedIphoneTemplate
} from './ios-dedicated-simulator.mjs';
import {
  assertForegroundSyncLifecycleRequestPhase,
  verifyForegroundSyncLifecycleAcceptance
} from './ios-foreground-sync-lifecycle-snapshot.mjs';
import { waitForForegroundSyncLifecycleSnapshot } from './ios-foreground-sync-lifecycle-state.mjs';

const SCENARIO = 'foreground-sync-lifecycle';
const BUNDLE_ID = 'com.foliole.ios.bootstrap-acceptance';
const DATABASE_RELATIVE_PATH = 'Library/CapacitorDatabase/foliole-companionSQLite.db';
const RESULT_RELATIVE_PATH = 'Library/FolioleBridgeAcceptance/result.json';

export async function runIosForegroundSyncLifecycleAcceptance(
  repoRoot,
  artifactDir = path.join(repoRoot, '.tmp/artifacts/ios-bridge-acceptance', SCENARIO)
) {
  const resourceMode = resolveIosResourceMode();
  const options = {
    artifactDir, derivedData: path.join(artifactDir, 'DerivedData'), repoRoot, resourceMode,
    resourceArgs: iosXcodebuildResourceArgs(resourceMode)
  };
  prepareArtifactDirectory(artifactDir);
  let service = null;
  let udid = null;
  try {
    setPhase(options, 'endpoint-ready', 'prepare');
    const template = selectDedicatedIphoneTemplate(runJson(options, 'xcrun', ['simctl', 'list', 'devices', 'available', '--json']));
    udid = capture(options, 'xcrun', createDedicatedSimulatorArgs(template, `Foliole Foreground Sync ${process.pid}`)).trim();
    if (!udid) throw new Error('Dedicated iOS foreground sync Simulator was not created.');
    writeFileSync(path.join(artifactDir, 'simulator-owned.json'), `${JSON.stringify({ template, udid }, null, 2)}\n`);
    service = startPairingAcceptanceService(repoRoot, artifactDir, SCENARIO);
    const serviceInfo = await waitForJson(options, 'service.json', 'lifecycle service', (value) => Boolean(value.endpoint));
    prepareBuild(options, udid, serviceInfo.endpoint);
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
    await waitForRequestPhase(options, 'recovered-resume', 1);
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
    if (udid) writeSimulatorLog(options, udid);
    throw error;
  } finally {
    if (udid) cleanupSimulator(options, udid);
    service?.kill('SIGTERM');
  }
}

function prepareArtifactDirectory(artifactDir) {
  mkdirSync(artifactDir, { recursive: true });
  for (const name of ['evidence.json', 'failure.json', 'lifecycle-actions.json', 'lifecycle-control.json', 'result.json', 'simulator.log']) {
    rmSync(path.join(artifactDir, name), { force: true });
  }
}

function prepareBuild(options, udid, endpoint) {
  runHeavy(options, 'npm', ['run', 'android:web:build'], { env: createLifecycleBuildEnv(process.env, endpoint) });
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
  run(options, 'xcrun', ['simctl', 'boot', udid]);
  run(options, 'xcrun', ['simctl', 'bootstatus', udid, '-b']);
  const app = path.join(options.derivedData, 'Build/Products/Debug-iphonesimulator/App.app');
  run(options, 'codesign', ['--verify', '--deep', '--strict', app]);
  const signature = verifyAcceptanceAppSignature(captureAllowFailure(options, 'codesign', ['-d', '--verbose=4', app]), BUNDLE_ID);
  if (signature !== BUNDLE_ID) throw new Error('Lifecycle acceptance signature verification failed.');
  run(options, 'xcrun', ['simctl', 'install', udid, app]);
}

async function enterBackground(options, udid, resultPath, deltas, previous = { pause_count: 0 }) {
  const before = readObservations(options).foreground_sync_lifecycle.request_count;
  recordAction(options, 'background', 'launch-settings');
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
  return waitForAcceptanceObservation({ accept, describe: (value) => `phase=${value?.phase ?? 'missing'}`,
    initialObservation: `${label} result was not readable`, label,
    read: () => JSON.parse(readFileSync(resultPath, 'utf8')), timeoutMs });
}

function waitForJson(options, name, label, accept) {
  return waitForAcceptanceObservation({ accept, describe: () => `${label} incomplete`, initialObservation: `${label} missing`,
    label, read: () => JSON.parse(readFileSync(path.join(options.artifactDir, name), 'utf8')) });
}

function readObservations(options) {
  return JSON.parse(readFileSync(path.join(options.artifactDir, 'service-observations.json'), 'utf8'));
}

function setPhase(options, phase, action) {
  writeFileSync(path.join(options.artifactDir, 'lifecycle-control.json'), `${JSON.stringify({ phase })}\n`);
  recordAction(options, phase, action);
}

function recordAction(options, phase, action) {
  const file = path.join(options.artifactDir, 'lifecycle-actions.json');
  let actions = [];
  try { actions = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first action */ }
  actions.push({ action, at: new Date().toISOString(), phase });
  writeFileSync(file, `${JSON.stringify(actions, null, 2)}\n`);
}

function launch(options, udid, terminate) {
  recordAction(options, 'acceptance-app', terminate ? 'launch-fresh-process' : 'bring-to-foreground');
  run(options, 'xcrun', ['simctl', 'launch', ...(terminate ? ['--terminate-running-process'] : []), udid, BUNDLE_ID]);
}

function resolveContainer(options, udid) {
  return capture(options, 'xcrun', ['simctl', 'get_app_container', udid, BUNDLE_ID, 'data']).trim();
}

function cleanupSimulator(options, udid) {
  runAllowFailure(options, 'xcrun', ['simctl', 'terminate', udid, BUNDLE_ID]);
  const cleanup = dedicatedSimulatorCleanupArgs(udid);
  runAllowFailure(options, 'xcrun', cleanup.shutdown);
  runAllowFailure(options, 'xcrun', cleanup.delete);
}

function writeSimulatorLog(options, udid) {
  writeFileSync(path.join(options.artifactDir, 'simulator.log'), captureAllowFailure(options, 'xcrun', [
    'simctl', 'spawn', udid, 'log', 'show', '--last', '5m', '--style', 'compact', '--predicate', 'process == "App"'
  ]));
}

function runHeavy(options, command, args, extra = {}) {
  const task = iosResourceCommand(command, args, options.resourceMode);
  run(options, task.command, task.args, extra);
}
function runJson(options, command, args) { return JSON.parse(capture(options, command, args)); }
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
