/* global console, process */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { iosResourceCommand, iosXcodebuildResourceArgs, resolveIosResourceMode } from './ios-resource-profile.mjs';
import { resolveIosDatabaseUpgradeContractFixture } from './ios-database-upgrade-contract-fixture.mjs';
import { prepareIosAcceptanceCache } from './ios-local-storage.mjs';
import {
  readUpgradeSnapshot,
  verifyIosDatabaseUpgradeAcceptance
} from './ios-database-upgrade-acceptance-snapshot.mjs';
import {
  createSimulatorAcceptanceBuildArgs,
  selectSimulator,
  shouldShutdownSimulator,
  verifyBridgeResult,
  waitForAcceptanceObservation,
  writeAcceptanceFailure
} from './ios-simulator-acceptance-runner.mjs';

const SCENARIO = 'database-upgrade-runtime';
const DATABASE_RELATIVE_PATH = 'Library/CapacitorDatabase/foliole-companionSQLite.db';
const RESULT_RELATIVE_PATH = 'Library/FolioleBridgeAcceptance/result.json';
const ACCEPTANCE_ENV_KEYS = [
  'VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE', 'VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT',
  'VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO', 'VITE_FOLIOLE_IOS_DATABASE_UPGRADE_FAULT'
];

export async function runIosDatabaseUpgradeAcceptance(
  repoRoot,
  artifactDir = path.join(repoRoot, '.tmp/artifacts/ios-bridge-acceptance', SCENARIO)
) {
  const resourceMode = resolveIosResourceMode();
  const options = {
    artifactDir, bundleId: 'com.foliole.ios.bootstrap-acceptance',
    derivedData: prepareIosAcceptanceCache(repoRoot).derivedData, repoRoot,
    resourceArgs: iosXcodebuildResourceArgs(resourceMode), resourceMode
  };
  mkdirSync(options.artifactDir, { recursive: true });
  rmSync(path.join(options.artifactDir, 'failure.json'), { force: true });
  rmSync(path.join(options.artifactDir, 'result.json'), { force: true });
  rmSync(path.join(options.artifactDir, 'simulator.log'), { force: true });
  let simulator = null;
  let ownsSimulator = false;
  try {
    simulator = selectSimulator(runJson(options.repoRoot, 'xcrun', ['simctl', 'list', 'devices', 'available', '--json']));
    ownsSimulator = shouldShutdownSimulator(simulator);
    prepareBuild(options, simulator.udid, false);
    bootSimulator(options.repoRoot, simulator);
    installApp(options, simulator.udid, true);
    seedAcceptanceDeviceIdentity(options, simulator.udid);
    const containerPath = resolveContainer(options, simulator.udid);
    let databasePath = path.join(containerPath, DATABASE_RELATIVE_PATH);
    let resultPath = path.join(containerPath, RESULT_RELATIVE_PATH);

    replaceWithVersionedFixture(options, databasePath);
    const first = await launchAndRead(options, simulator.udid, resultPath, true);
    const firstSnapshot = readUpgradeSnapshot((command, args) => capture(options.repoRoot, command, args), databasePath);
    terminate(options, simulator.udid);
    rmSync(resultPath, { force: true });
    const second = await launchAndRead(options, simulator.udid, resultPath, true);
    const secondSnapshot = readUpgradeSnapshot((command, args) => capture(options.repoRoot, command, args), databasePath);
    terminate(options, simulator.udid);

    replaceWithVersionedFixture(options, databasePath);
    prepareBuild(options, simulator.udid, true);
    installApp(options, simulator.udid, false);
    ({ databasePath, resultPath } = resolvePreservedContainer(options, simulator.udid));
    rmSync(resultPath, { force: true });
    const failed = await launchAndRead(options, simulator.udid, resultPath, false);
    const failedSnapshot = readUpgradeSnapshot((command, args) => capture(options.repoRoot, command, args), databasePath);
    terminate(options, simulator.udid);

    prepareBuild(options, simulator.udid, false);
    installApp(options, simulator.udid, false);
    ({ databasePath, resultPath } = resolvePreservedContainer(options, simulator.udid));
    rmSync(resultPath, { force: true });
    const recovered = await launchAndRead(options, simulator.udid, resultPath, true);
    const recoveredSnapshot = readUpgradeSnapshot((command, args) => capture(options.repoRoot, command, args), databasePath);
    terminate(options, simulator.udid);

    const result = verifyIosDatabaseUpgradeAcceptance({
      failed, failedSnapshot, first, firstSnapshot, recovered, recoveredSnapshot, second, secondSnapshot
    }, verifyBridgeResult);
    const report = { database_upgrade: result, simulator: simulator.name };
    writeFileSync(path.join(options.artifactDir, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    writeAcceptanceFailure(options.artifactDir, error);
    if (simulator) {
      writeFileSync(path.join(options.artifactDir, 'simulator.log'), captureAllowFailure(options.repoRoot, 'xcrun', [
        'simctl', 'spawn', simulator.udid, 'log', 'show', '--last', '5m', '--style', 'compact',
        '--predicate', 'process == "App"'
      ]));
    }
    throw error;
  } finally {
    if (simulator) {
      terminate(options, simulator.udid, true);
      if (ownsSimulator) runAllowFailure(options.repoRoot, 'xcrun', ['simctl', 'shutdown', simulator.udid]);
    }
  }
}

export function createUpgradeBuildEnv(env, fault) {
  const sanitized = sanitizeAcceptanceEnv(env);
  return {
    ...sanitized,
    VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1',
    VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: SCENARIO,
    ...(fault ? { VITE_FOLIOLE_IOS_DATABASE_UPGRADE_FAULT: '1' } : {})
  };
}

export function createOrdinaryBuildEnv(env) {
  return sanitizeAcceptanceEnv(env);
}

function prepareBuild(options, udid, fault) {
  runHeavy(options, 'npm', ['run', 'android:web:build'], { env: createUpgradeBuildEnv(process.env, fault) });
  run(options.repoRoot, 'npx', ['--no-install', 'cap', 'copy', 'ios']);
  try {
    const args = createSimulatorAcceptanceBuildArgs({
      bundleId: options.bundleId, derivedData: options.derivedData, repoRoot: options.repoRoot,
      resourceArgs: options.resourceArgs, udid
    });
    runHeavy(options, 'xcodebuild', args);
  } finally {
    runHeavy(options, 'npm', ['run', 'android:web:build'], { env: createOrdinaryBuildEnv(process.env) });
    run(options.repoRoot, 'npx', ['--no-install', 'cap', 'copy', 'ios']);
  }
}

function installApp(options, udid, fresh) {
  if (fresh) runAllowFailure(options.repoRoot, 'xcrun', ['simctl', 'uninstall', udid, options.bundleId]);
  const app = path.join(options.derivedData, 'Build/Products/Debug-iphonesimulator/App.app');
  run(options.repoRoot, 'codesign', ['--verify', '--deep', '--strict', app]);
  run(options.repoRoot, 'xcrun', ['simctl', 'install', udid, app]);
}

function seedAcceptanceDeviceIdentity(options, udid) {
  run(options.repoRoot, 'xcrun', [
    'simctl', 'spawn', udid, 'defaults', 'write', options.bundleId,
    'foliole-companion-ios-device-id', 'ios-upgrade-device'
  ]);
}

function replaceWithVersionedFixture(options, databasePath) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
  const fixture = resolveIosDatabaseUpgradeContractFixture(options.repoRoot);
  copyFileSync(fixture.databasePath, databasePath);
}

async function launchAndRead(options, udid, resultPath, expectPassed) {
  const result = await waitForAcceptanceObservation({
    accept: (value) => value?.status === 'passed' || value?.status === 'failed',
    action: () => run(options.repoRoot, 'xcrun', ['simctl', 'launch', '--terminate-running-process', udid, options.bundleId]),
    describe: (value) => `database upgrade status=${value?.status ?? 'missing'}`,
    initialObservation: 'database upgrade result was not readable',
    label: 'iOS database upgrade bridge result',
    read: () => JSON.parse(readFileSync(resultPath, 'utf8'))
  });
  return expectPassed ? verifyBridgeResult(result, SCENARIO) : result;
}

function bootSimulator(repoRoot, simulator) {
  if (simulator.state === 'Booted') return;
  run(repoRoot, 'xcrun', ['simctl', 'boot', simulator.udid]);
  run(repoRoot, 'xcrun', ['simctl', 'bootstatus', simulator.udid, '-b']);
}

function resolveContainer(options, udid) {
  return capture(options.repoRoot, 'xcrun', ['simctl', 'get_app_container', udid, options.bundleId, 'data']).trim();
}

function resolvePreservedContainer(options, udid) {
  const containerPath = resolveContainer(options, udid);
  const databasePath = path.join(containerPath, DATABASE_RELATIVE_PATH);
  if (!existsSync(databasePath)) throw new Error('iOS database upgrade overwrite install did not preserve the fixture.');
  return { databasePath, resultPath: path.join(containerPath, RESULT_RELATIVE_PATH) };
}

function sanitizeAcceptanceEnv(env) {
  const sanitized = { ...env };
  for (const key of ACCEPTANCE_ENV_KEYS) delete sanitized[key];
  return sanitized;
}

function terminate(options, udid, allowFailure = false) {
  const args = ['simctl', 'terminate', udid, options.bundleId];
  return allowFailure ? runAllowFailure(options.repoRoot, 'xcrun', args) : run(options.repoRoot, 'xcrun', args);
}

function runHeavy(options, command, args, extra = {}) {
  const task = iosResourceCommand(command, args, options.resourceMode);
  run(options.repoRoot, task.command, task.args, extra);
}

function runJson(repoRoot, command, args) { return JSON.parse(capture(repoRoot, command, args)); }
function capture(repoRoot, command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed with ${result.status}`);
  return result.stdout;
}
function run(repoRoot, command, args, extra = {}) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', ...extra });
  if (result.status !== 0) throw new Error(`${command} failed with ${result.status}`);
}
function runAllowFailure(repoRoot, command, args) {
  spawnSync(command, args, { cwd: repoRoot, stdio: 'ignore' });
}
function captureAllowFailure(repoRoot, command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8' });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}
