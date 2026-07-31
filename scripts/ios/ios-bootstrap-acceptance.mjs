#!/usr/bin/env node
/* global console, process */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  iosResourceCommand,
  iosXcodebuildResourceArgs,
  resolveIosResourceMode
} from './ios-resource-profile.mjs';
import {
  createSimulatorAcceptanceBuildArgs,
  parseBootstrapSnapshot,
  selectSimulator,
  shouldShutdownSimulator,
  verifyBridgeResult,
  verifyAcceptanceAppSignature,
  waitForAcceptanceObservation,
  waitForBootstrapSnapshot,
  writeAcceptanceFailure
} from './ios-simulator-acceptance-runner.mjs';
import {
  startPairingAcceptanceService
} from './ios-pairing-acceptance-runner.mjs';
import { readServiceObservations, verifyAcceptanceScenario } from './ios-acceptance-scenario-result.mjs';
import { runAcceptanceRestart } from './ios-acceptance-restart-runner.mjs';
import { readAcceptanceScenarioSnapshot } from './ios-acceptance-snapshot.mjs';
import { resolveAcceptanceScenario } from './ios-sync-pack-acceptance-runner.mjs';
import { runStandaloneIosAcceptanceScenario } from './ios-standalone-acceptance-runner.mjs';
import { assertQualityCommandAllowed } from '../quality/quality-command-contracts.mjs';

export { selectSimulator, shouldShutdownSimulator, waitForBootstrapSnapshot };

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCENARIO = resolveAcceptanceScenario(process.env.FOLIOLE_IOS_ACCEPTANCE_SCENARIO);
const ARTIFACT_DIR = resolveAcceptanceArtifactDir(REPO_ROOT, SCENARIO);
const DERIVED_DATA = path.join(ARTIFACT_DIR, 'DerivedData');
const ACCEPTANCE_BUNDLE_ID = 'com.foliole.ios.bootstrap-acceptance';
const DATABASE_RELATIVE_PATH = 'Library/CapacitorDatabase/foliole-companionSQLite.db';
const BRIDGE_RESULT_RELATIVE_PATH = 'Library/FolioleBridgeAcceptance/result.json';
const BOOTSTRAP_SNAPSHOT_TIMEOUT_MS = 60_000;
const REQUIRED_TABLES = ['companion_meta', 'nodes', 'sync_object_state'];
const RESOURCE_MODE = resolveIosResourceMode();

export function resolveAcceptanceArtifactDir(repoRoot, scenario) {
  return path.join(repoRoot, '.tmp/artifacts/ios-bridge-acceptance', scenario);
}

export function createAcceptanceBuildArgs(udid) {
  return createSimulatorAcceptanceBuildArgs({
    bundleId: ACCEPTANCE_BUNDLE_ID,
    derivedData: DERIVED_DATA,
    repoRoot: REPO_ROOT,
    resourceArgs: iosXcodebuildResourceArgs(RESOURCE_MODE),
    udid
  });
}

export function verifyBootstrapSnapshots(first, second) {
  if (!first.deviceId) throw new Error('The first launch did not persist a device identity.');
  if (first.tableCount !== REQUIRED_TABLES.length) throw new Error('The first launch did not install the required schema.');
  if (second.deviceId !== first.deviceId) throw new Error('The device identity changed after process restart.');
  if (second.tableCount !== REQUIRED_TABLES.length) throw new Error('The schema changed after process restart.');
  return { databaseReady: true, deviceId: first.deviceId, requiredTableCount: first.tableCount };
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('iOS bootstrap acceptance requires macOS with Xcode.');
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  let simulator = null;
  let service = null;
  let ownsBootedSimulator = false;
  const scenario = SCENARIO;
  if (await runStandaloneIosAcceptanceScenario(scenario, REPO_ROOT, ARTIFACT_DIR)) return;
  try {
    service = startPairingAcceptanceService(REPO_ROOT, ARTIFACT_DIR, scenario);
    const serviceInfo = await waitForAcceptanceObservation({
      accept: (value) => typeof value?.endpoint === 'string',
      initialObservation: 'pairing service endpoint was not readable',
      label: 'iOS pairing acceptance service',
      read: () => JSON.parse(readFileSync(path.join(ARTIFACT_DIR, 'service.json'), 'utf8'))
    });
    simulator = selectSimulator(runJson('xcrun', ['simctl', 'list', 'devices', 'available', '--json']));
    ownsBootedSimulator = shouldShutdownSimulator(simulator);
    prepareApp(simulator.udid, serviceInfo.endpoint, scenario);
    bootSimulator(simulator);
    const signatureIdentifier = installFreshAcceptanceApp(simulator.udid);
    const containerPath = resolveContainerPath(simulator.udid);
    const databasePath = path.join(containerPath, DATABASE_RELATIVE_PATH);
    const bridgeResultPath = path.join(containerPath, BRIDGE_RESULT_RELATIVE_PATH);
    const first = await waitForBootstrapSnapshot(
      () => readBootstrapSnapshot(databasePath),
      () => launchApp(simulator.udid),
      BOOTSTRAP_SNAPSHOT_TIMEOUT_MS
    );
    const firstBridge = verifyBridgeResult(await waitForAcceptanceObservation({
      accept: (result) => result?.status === 'passed' || result?.status === 'failed',
      describe: (result) => `scenario status=${result?.status ?? 'missing'}`,
      initialObservation: 'bridge result was not readable',
      label: 'iOS WebView bridge result',
      read: () => JSON.parse(readFileSync(bridgeResultPath, 'utf8'))
    }), scenario);
    run('xcrun', ['simctl', 'terminate', simulator.udid, ACCEPTANCE_BUNDLE_ID]);
    const firstContentObservations = scenario === 'content-resource-read'
      ? readServiceObservations(ARTIFACT_DIR)
      : null;
    const firstScenarioSnapshot = readAcceptanceSnapshot(scenario, containerPath);
    rmSync(bridgeResultPath, { force: true });
    const { second, secondBridge, syncPackRejections } = await runAcceptanceRestart({
      bridgeResultPath,
      launch: () => launchApp(simulator.udid),
      readBootstrap: () => readBootstrapSnapshot(databasePath),
      readSnapshot: () => readAcceptanceSnapshot(scenario, containerPath),
      removeBridgeResult: () => rmSync(bridgeResultPath, { force: true }),
      scenario,
      bootstrapTimeoutMs: BOOTSTRAP_SNAPSHOT_TIMEOUT_MS,
      terminate: () => run('xcrun', ['simctl', 'terminate', simulator.udid, ACCEPTANCE_BUNDLE_ID])
    });
    const result = verifyBootstrapSnapshots(first, second);
    const scenarioResult = verifyAcceptanceScenario({
      firstBridge,
      firstContentObservations,
      firstScenarioSnapshot,
      pairingObservations: readServiceObservations(ARTIFACT_DIR),
      scenario,
      secondBridge,
      secondContentObservations: readServiceObservations(ARTIFACT_DIR),
      secondScenarioSnapshot: readAcceptanceSnapshot(scenario, containerPath),
      syncPackRejections
    });
    const report = { ...result, ...scenarioResult, signatureIdentifier, simulator: simulator.name };
    writeFileSync(path.join(ARTIFACT_DIR, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    writeAcceptanceFailure(ARTIFACT_DIR, error);
    if (simulator) {
      writeFileSync(path.join(ARTIFACT_DIR, 'simulator.log'), captureAllowFailure('xcrun', [
        'simctl', 'spawn', simulator.udid, 'log', 'show', '--last', '5m', '--style', 'compact',
        '--predicate', 'process == "App"'
      ]));
    }
    throw error;
  } finally {
    if (simulator) {
      runAllowFailure('xcrun', ['simctl', 'terminate', simulator.udid, ACCEPTANCE_BUNDLE_ID]);
      if (ownsBootedSimulator) runAllowFailure('xcrun', ['simctl', 'shutdown', simulator.udid]);
    }
    service?.kill('SIGTERM');
  }
}

function bootSimulator(simulator) {
  if (simulator.state === 'Booted') return;
  run('xcrun', ['simctl', 'boot', simulator.udid]);
  run('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b']);
}

function prepareApp(udid, endpoint, scenario) {
  runHeavy('npm', ['run', 'android:web:build'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1',
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT: endpoint,
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: scenario
    }
  });
  run('npx', ['--no-install', 'cap', 'copy', 'ios'], { cwd: REPO_ROOT });
  try {
    runHeavy('xcodebuild', createAcceptanceBuildArgs(udid));
  } finally {
    runHeavy('npm', ['run', 'android:web:build'], { cwd: REPO_ROOT });
    run('npx', ['--no-install', 'cap', 'copy', 'ios'], { cwd: REPO_ROOT });
  }
}

function installFreshAcceptanceApp(udid) {
  runAllowFailure('xcrun', ['simctl', 'uninstall', udid, ACCEPTANCE_BUNDLE_ID]);
  const app = path.join(DERIVED_DATA, 'Build/Products/Debug-iphonesimulator/App.app');
  run('codesign', ['--verify', '--deep', '--strict', app]);
  run('xcrun', ['simctl', 'install', udid, app]);
  return verifyAcceptanceAppSignature(captureAllowFailure('codesign', ['-d', '--verbose=4', app]), ACCEPTANCE_BUNDLE_ID);
}

function launchApp(udid) {
  run('xcrun', ['simctl', 'launch', '--terminate-running-process', udid, ACCEPTANCE_BUNDLE_ID]);
}

function resolveContainerPath(udid) {
  return capture('xcrun', ['simctl', 'get_app_container', udid, ACCEPTANCE_BUNDLE_ID, 'data']).trim();
}

function readBootstrapSnapshot(databasePath) {
  const names = REQUIRED_TABLES.map((name) => `'${name}'`).join(', ');
  const sql = `SELECT value FROM companion_meta WHERE key = 'device_id'; SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name IN (${names});`;
  return parseBootstrapSnapshot(capture('sqlite3', ['-cmd', '.timeout 1000', databasePath, sql]));
}

function readAcceptanceSnapshot(scenario, containerPath) {
  return readAcceptanceScenarioSnapshot(scenario, { capture, containerPath, databaseRelativePath: DATABASE_RELATIVE_PATH });
}

function runJson(command, args) {
  return JSON.parse(capture(command, args));
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed with ${result.status}`);
  return result.stdout;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} failed with ${result.status}`);
}

function runHeavy(command, args, options = {}) {
  const task = iosResourceCommand(command, args, RESOURCE_MODE);
  run(task.command, task.args, options);
}

function runAllowFailure(command, args) {
  spawnSync(command, args, { cwd: REPO_ROOT, stdio: 'ignore' });
}

function captureAllowFailure(command, args) {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  assertQualityCommandAllowed('runner:ios-simulator');
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
