/* global console, process */

import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { readServiceObservations, verifyAcceptanceScenario } from './ios-acceptance-scenario-result.mjs';
import { resolveAcceptanceDatabasePath } from './ios-bootstrap-database-path.mjs';
import {
  runIosInfrastructureCommand,
  waitForIosBridgeResult
} from './ios-acceptance-infrastructure-error.mjs';
import { writeIosAcceptanceAttemptEvidence } from './ios-acceptance-attempt-evidence.mjs';
import { restartBridgeResultTimeoutMs, runAcceptanceRestart } from './ios-acceptance-restart-runner.mjs';
import { readAcceptanceScenarioSnapshot } from './ios-acceptance-snapshot.mjs';
import { iosAcceptanceSimulatorName } from './ios-acceptance-simulator-identity.mjs';
import { cleanupOwnedIosSimulator, createOwnedIosSimulator } from './ios-dedicated-simulator-runtime.mjs';
import { startSyncGroupProvider, stopSyncGroupProvider,
  waitForSyncGroupProviderReady } from './ios-sync-group-provider-runner.mjs';
import { iosResourceCommand, iosXcodebuildResourceArgs, resolveIosResourceMode } from './ios-resource-profile.mjs';
import { prepareIosAcceptanceCache, resolveIosAcceptanceCache } from './ios-local-storage.mjs';
import {
  createSimulatorAcceptanceBuildArgs,
  parseBootstrapSnapshot,
  readBridgeFailure,
  verifyAcceptanceAppSignature,
  verifyBridgeResult,
  waitForBootstrapSnapshotOrFailure,
  waitForBootstrapSnapshot,
  writeAcceptanceFailure
} from './ios-simulator-acceptance-runner.mjs';

const BUNDLE_ID = 'com.foliole.ios.bootstrap-acceptance';
const DATABASE_RELATIVE_PATH = 'Library/CapacitorDatabase/foliole-companionSQLite.db';
const RESULT_RELATIVE_PATH = 'Library/FolioleBridgeAcceptance/result.json';
const BOOTSTRAP_TIMEOUT_MS = 60_000;
const REQUIRED_TABLES = ['companion_meta', 'nodes', 'sync_object_state'];

export function createAcceptanceBuildArgs(udid, options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(import.meta.dirname, '../..');
  const derivedData = options.derivedData ?? resolveIosAcceptanceCache(repoRoot).derivedData;
  const resourceMode = options.resourceMode ?? resolveIosResourceMode();
  return createSimulatorAcceptanceBuildArgs({
    bundleId: BUNDLE_ID, derivedData, repoRoot,
    resourceArgs: iosXcodebuildResourceArgs(resourceMode), udid
  });
}

export function verifyBootstrapSnapshots(first, second, expectedDeviceProfile) {
  if (!first.deviceId) throw new Error('The first launch did not persist a device identity.');
  if (expectedDeviceProfile && first.deviceId !== expectedDeviceProfile) {
    throw new Error('The iOS device profile does not match the current system name.');
  }
  if (first.tableCount !== REQUIRED_TABLES.length) throw new Error('The first launch did not install the required schema.');
  if (second.deviceId !== first.deviceId) throw new Error('The device identity changed after process restart.');
  if (second.tableCount !== REQUIRED_TABLES.length) throw new Error('The schema changed after process restart.');
  return { databaseReady: true, deviceId: first.deviceId, requiredTableCount: first.tableCount };
}

export async function runIosBootstrapAcceptanceAttempt(repoRoot, scenario, artifactDir, attemptNumber) {
  const options = createOptions(repoRoot, artifactDir);
  let owned = null;
  let service = null;
  try {
    owned = createOwnedIosSimulator({
      artifactDir, create: (args) => capture(options, 'xcrun', args),
      listAvailable: () => runJson(options, 'xcrun', ['simctl', 'list', 'devices', 'available', '--json']),
      name: iosAcceptanceSimulatorName(scenario, process.pid, attemptNumber)
    });
    service = startSyncGroupProvider(repoRoot, artifactDir, scenario);
    await waitForSyncGroupProviderReady(service);
    prepareApp(options, owned.udid, scenario);
    bootSimulator(options, owned.udid);
    const signatureIdentifier = installFreshAcceptanceApp(options, owned.udid);
    const containerPath = resolveContainerPath(options, owned.udid);
    const bridgeResultPath = path.join(containerPath, RESULT_RELATIVE_PATH);
    const { databasePath, first, firstBridge } = await runInitialAcceptanceLaunch(
      options, scenario, owned.udid, containerPath, bridgeResultPath
    );
    run(options, 'xcrun', ['simctl', 'terminate', owned.udid, BUNDLE_ID]);
    const firstContentObservations = scenario === 'content-resource-read' ? readServiceObservations(artifactDir) : null;
    const firstScenarioSnapshot = readSnapshot(options, scenario, containerPath);
    rmSync(bridgeResultPath, { force: true });
    const restart = await runAcceptanceRestart({
      bootstrapTimeoutMs: BOOTSTRAP_TIMEOUT_MS, bridgeResultPath,
      launch: () => launchApp(options, owned.udid),
      readBootstrap: () => readBootstrapSnapshot(options, databasePath),
      readBridgeResult: () => readBridgeResult(
        bridgeResultPath, restartBridgeResultTimeoutMs(scenario)
      ),
      readSnapshot: () => readSnapshot(options, scenario, containerPath),
      removeBridgeResult: () => rmSync(bridgeResultPath, { force: true }), scenario,
      terminate: () => run(options, 'xcrun', ['simctl', 'terminate', owned.udid, BUNDLE_ID])
    });
    const result = verifyBootstrapSnapshots(first, restart.second, owned.name);
    await stopSyncGroupProvider(service);
    service = null;
    const providerObservations = readServiceObservations(artifactDir);
    const secondScenarioSnapshot = readSnapshot(options, scenario, containerPath);
    writeIosAcceptanceAttemptEvidence(artifactDir, { firstBridge, firstContentObservations,
      firstScenarioSnapshot, providerObservations, secondBridge: restart.secondBridge,
      secondContentObservations: providerObservations, secondScenarioSnapshot });
    const scenarioResult = verifyAcceptanceScenario({
      firstBridge, firstContentObservations, firstScenarioSnapshot,
      providerObservations, scenario,
      secondBridge: restart.secondBridge, secondContentObservations: providerObservations,
      secondScenarioSnapshot,
      syncPackRejections: restart.syncPackRejections
    });
    const report = { ...result, ...scenarioResult, signatureIdentifier, simulator: owned };
    writeFileSync(path.join(artifactDir, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    writeAcceptanceFailure(artifactDir, error);
    throw error;
  } finally {
    try {
      if (owned) cleanupSimulator(options, artifactDir, owned.udid);
    } finally {
      if (service) await stopSyncGroupProvider(service);
    }
  }
}

function createOptions(repoRoot, artifactDir) {
  const resourceMode = resolveIosResourceMode();
  return { artifactDir, derivedData: prepareIosAcceptanceCache(repoRoot).derivedData,
    repoRoot, resourceMode };
}

function prepareApp(options, udid, scenario) {
  runHeavy(options, 'npm', ['run', 'android:web:build'], { env: { ...process.env,
    VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1',
    VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: scenario } });
  run(options, 'npx', ['--no-install', 'cap', 'copy', 'ios']);
  try { runHeavy(options, 'xcodebuild', createAcceptanceBuildArgs(udid, options)); }
  finally {
    runHeavy(options, 'npm', ['run', 'android:web:build']);
    run(options, 'npx', ['--no-install', 'cap', 'copy', 'ios']);
  }
}

function bootSimulator(options, udid) {
  runIosInfrastructureCommand('simulator-boot', () => {
    run(options, 'xcrun', ['simctl', 'boot', udid]);
    run(options, 'xcrun', ['simctl', 'bootstatus', udid, '-b']);
  });
}

function installFreshAcceptanceApp(options, udid) {
  const app = path.join(options.derivedData, 'Build/Products/Debug-iphonesimulator/App.app');
  run(options, 'codesign', ['--verify', '--deep', '--strict', app]);
  run(options, 'xcrun', ['simctl', 'install', udid, app]);
  return verifyAcceptanceAppSignature(captureAllowFailure(options, 'codesign', ['-d', '--verbose=4', app]), BUNDLE_ID);
}

function launchApp(options, udid) {
  return runIosInfrastructureCommand('app-launch', () =>
    run(options, 'xcrun', ['simctl', 'launch', '--terminate-running-process', udid, BUNDLE_ID]));
}

function readBridgeResult(resultPath, timeoutMs) {
  return waitForIosBridgeResult({
    accept: (result) => result?.status === 'passed' || result?.status === 'failed',
    describe: (result) => `scenario status=${result?.status ?? 'missing'}`,
    initialObservation: 'bridge result was not readable', label: 'iOS WebView bridge result', resultPath, timeoutMs
  });
}

function resolveContainerPath(options, udid) {
  return capture(options, 'xcrun', ['simctl', 'get_app_container', udid, BUNDLE_ID, 'data']).trim();
}

export function readBootstrapSnapshot(options, databasePath) {
  if (!existsSync(databasePath)) {
    throw new Error('iOS bootstrap database has not been created yet.');
  }
  const names = REQUIRED_TABLES.map((name) => `'${name}'`).join(', ');
  const sql = `SELECT value FROM companion_meta WHERE key = 'device_id'; SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name IN (${names});`;
  return parseBootstrapSnapshot(capture(options, 'sqlite3', ['-cmd', '.timeout 1000', databasePath, sql]));
}

function readSnapshot(options, scenario, containerPath) {
  return readAcceptanceScenarioSnapshot(scenario, {
    capture: (command, args) => capture(options, command, args), containerPath,
    databaseRelativePath: DATABASE_RELATIVE_PATH
  });
}

async function runInitialAcceptanceLaunch(options, scenario, udid, containerPath, bridgeResultPath) {
  if (scenario !== 'sync-group-signed-transport') {
    const databasePath = path.join(containerPath, DATABASE_RELATIVE_PATH);
    const first = await waitForBootstrapSnapshotOrFailure(
      () => readBootstrapSnapshot(options, databasePath),
      () => readBridgeFailure(bridgeResultPath),
      () => launchApp(options, udid), BOOTSTRAP_TIMEOUT_MS
    );
    const firstBridge = verifyBridgeResult(await readBridgeResult(
      bridgeResultPath, restartBridgeResultTimeoutMs(scenario)
    ), scenario);
    return { databasePath, first, firstBridge };
  }
  launchApp(options, udid);
  const firstBridge = verifyBridgeResult(await readBridgeResult(bridgeResultPath, BOOTSTRAP_TIMEOUT_MS), scenario);
  const databasePath = resolveAcceptanceDatabasePath(containerPath, firstBridge);
  const first = await waitForBootstrapSnapshot(
    () => readBootstrapSnapshot(options, databasePath), undefined, BOOTSTRAP_TIMEOUT_MS
  );
  return { databasePath, first, firstBridge };
}

function cleanupSimulator(options, artifactDir, udid) {
  cleanupOwnedIosSimulator({
    artifactDir, bundleId: BUNDLE_ID,
    captureLog: (args) => captureAllowFailure(options, 'xcrun', args),
    runAllowFailure: (args) => runAllowFailure(options, 'xcrun', args), udid
  });
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
function runHeavy(options, command, args, extra = {}) {
  const task = iosResourceCommand(command, args, options.resourceMode);
  run(options, task.command, task.args, extra);
}
function runAllowFailure(options, command, args) {
  spawnSync(command, args, { cwd: options.repoRoot, stdio: 'ignore', timeout: 600_000 });
}
function captureAllowFailure(options, command, args) {
  const result = spawnSync(command, args, { cwd: options.repoRoot, encoding: 'utf8', timeout: 600_000 });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}
