#!/usr/bin/env node
/* global console, process, setTimeout */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARTIFACT_DIR = path.join(REPO_ROOT, '.tmp/artifacts/ios-bootstrap-acceptance');
const DERIVED_DATA = path.join(ARTIFACT_DIR, 'DerivedData');
const ACCEPTANCE_BUNDLE_ID = 'com.foliole.ios.bootstrap-acceptance';
const DATABASE_RELATIVE_PATH = 'Library/CapacitorDatabase/foliole-companionSQLite.db';
const REQUIRED_TABLES = ['companion_meta', 'nodes', 'sync_object_state'];

export function selectSimulator(devicePayload) {
  const candidates = Object.entries(devicePayload.devices ?? {})
    .filter(([runtime]) => runtime.includes('iOS'))
    .flatMap(([, devices]) => devices)
    .filter((device) => device.isAvailable && /^iPhone /.test(device.name));
  candidates.sort((left, right) => Number(right.state === 'Booted') - Number(left.state === 'Booted'));
  if (!candidates[0]) throw new Error('Could not find an available iPhone simulator.');
  return candidates[0];
}

export function parseBootstrapSnapshot(output) {
  const [deviceId, tableCount] = output.trim().split('\n');
  return { deviceId: deviceId?.trim() ?? '', tableCount: Number(tableCount) };
}

export function verifyBootstrapSnapshots(first, second) {
  if (!first.deviceId) throw new Error('The first launch did not persist a device identity.');
  if (first.tableCount !== REQUIRED_TABLES.length) throw new Error('The first launch did not install the required schema.');
  if (second.deviceId !== first.deviceId) throw new Error('The device identity changed after process restart.');
  if (second.tableCount !== REQUIRED_TABLES.length) throw new Error('The schema changed after process restart.');
  return { databaseReady: true, deviceId: first.deviceId, requiredTableCount: first.tableCount };
}

export function waitForFileCreated(target, action, timeoutMs = 15000, intervalMs = 100) {
  action();
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (existsSync(target)) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for ${target}`));
        return;
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('iOS bootstrap acceptance requires macOS with Xcode.');
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const simulator = selectSimulator(runJson('xcrun', ['simctl', 'list', 'devices', 'available', '--json']));
  bootSimulator(simulator);
  prepareApp(simulator.udid);
  installFreshAcceptanceApp(simulator.udid);
  const databasePath = resolveDatabasePath(simulator.udid);
  await waitForFileCreated(databasePath, () => launchApp(simulator.udid));
  const first = readBootstrapSnapshot(databasePath);
  run('xcrun', ['simctl', 'terminate', simulator.udid, ACCEPTANCE_BUNDLE_ID]);
  launchApp(simulator.udid);
  const second = readBootstrapSnapshot(databasePath);
  const result = verifyBootstrapSnapshots(first, second);
  run('xcrun', ['simctl', 'terminate', simulator.udid, ACCEPTANCE_BUNDLE_ID]);
  const report = { ...result, databasePath, simulator: simulator.name };
  writeFileSync(path.join(ARTIFACT_DIR, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

function bootSimulator(simulator) {
  if (simulator.state === 'Booted') return;
  run('xcrun', ['simctl', 'boot', simulator.udid]);
  run('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b']);
}

function prepareApp(udid) {
  run('npm', ['run', 'android:web:build'], { cwd: REPO_ROOT });
  run('npx', ['--no-install', 'cap', 'copy', 'ios'], { cwd: REPO_ROOT });
  run('xcodebuild', [
    '-project', path.join(REPO_ROOT, 'ios/App/App.xcodeproj'),
    '-scheme', 'App', '-configuration', 'Debug',
    '-destination', `platform=iOS Simulator,id=${udid}`,
    '-derivedDataPath', DERIVED_DATA,
    `PRODUCT_BUNDLE_IDENTIFIER=${ACCEPTANCE_BUNDLE_ID}`,
    'CODE_SIGNING_ALLOWED=NO', 'build'
  ]);
}

function installFreshAcceptanceApp(udid) {
  runAllowFailure('xcrun', ['simctl', 'uninstall', udid, ACCEPTANCE_BUNDLE_ID]);
  const app = path.join(DERIVED_DATA, 'Build/Products/Debug-iphonesimulator/App.app');
  run('xcrun', ['simctl', 'install', udid, app]);
}

function launchApp(udid) {
  run('xcrun', ['simctl', 'launch', '--terminate-running-process', udid, ACCEPTANCE_BUNDLE_ID]);
}

function resolveDatabasePath(udid) {
  const container = capture('xcrun', ['simctl', 'get_app_container', udid, ACCEPTANCE_BUNDLE_ID, 'data']).trim();
  return path.join(container, DATABASE_RELATIVE_PATH);
}

function readBootstrapSnapshot(databasePath) {
  const names = REQUIRED_TABLES.map((name) => `'${name}'`).join(', ');
  const sql = `SELECT value FROM companion_meta WHERE key = 'device_id'; SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name IN (${names});`;
  return parseBootstrapSnapshot(capture('sqlite3', [databasePath, sql]));
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

function runAllowFailure(command, args) {
  spawnSync(command, args, { cwd: REPO_ROOT, stdio: 'ignore' });
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
