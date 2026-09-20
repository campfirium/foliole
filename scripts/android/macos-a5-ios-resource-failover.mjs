/* global process */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { cleanupOwnedIosSimulator, createOwnedIosSimulator } from '../ios/ios-dedicated-simulator-runtime.mjs';
import { prepareIosAcceptanceCache } from '../ios/ios-local-storage.mjs';
import { iosResourceCommand, iosXcodebuildResourceArgs, resolveIosResourceMode } from '../ios/ios-resource-profile.mjs';
import { createSimulatorAcceptanceBuildArgs, verifyAcceptanceAppSignature,
  waitForAcceptanceObservation } from '../ios/ios-simulator-acceptance-runner.mjs';
import { assertOwnedResourcePath, verifyA5ResourceLanPresence } from './macos-a5-resource-lan-probe.mjs';

const BUNDLE_ID = 'com.foliole.ios.bootstrap-acceptance';
const SCENARIO = 'resource-provider-failover';
const VITE_KEYS = ['VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE',
  'VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO', 'VITE_FOLIOLE_ACCEPTANCE_GROUP_ID',
  'VITE_FOLIOLE_ACCEPTANCE_MAC_ID', 'VITE_FOLIOLE_ACCEPTANCE_A5_ID',
  'VITE_FOLIOLE_ACCEPTANCE_NODE_ID', 'VITE_FOLIOLE_ACCEPTANCE_IMAGE_HASH',
  'VITE_FOLIOLE_ACCEPTANCE_TRANSFER_404'];

function command(root, name, args, options = {}) {
  const result = spawnSync(name, args, { cwd: root, encoding: 'utf8', timeout: 600_000,
    ...options });
  if (result.status !== 0) throw new Error(`${name} ${args[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function heavy(root, name, args, mode, options = {}) {
  const task = iosResourceCommand(name, args, mode);
  return command(root, task.command, task.args, options);
}

function ordinaryEnv() {
  const env = { ...process.env };
  for (const key of VITE_KEYS) delete env[key];
  return env;
}

async function readResult(resultPath, phase) {
  return waitForAcceptanceObservation({
    accept: (result) => result?.scenario === SCENARIO &&
      (result.phase === phase || result.status === 'failed'),
    describe: (result) => `${result?.phase ?? 'missing'}: ${result?.error ?? ''}`,
    label: `iOS ${phase}`, read: () => JSON.parse(fs.readFileSync(resultPath, 'utf8')),
    timeoutMs: 90_000
  });
}

function digest(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function assertOwnedSimulatorDeleted(root, udid) {
  const devices = JSON.parse(command(root, 'xcrun', ['simctl', 'list', 'devices', '--json']));
  if (Object.values(devices.devices ?? {}).flat().some((device) => device.udid === udid)) {
    throw new Error('Owned iOS acceptance Simulator was not deleted.');
  }
}

export async function runMacosA5IosResourceFailover({ args, buildIdentity, env, evidenceRoot,
  fixture, groupId, macDeviceId, a5DeviceId, macosLibrary, session, acceptIos }) {
  const root = path.join(evidenceRoot, 't203-ios-provider-failover');
  fs.mkdirSync(root, { recursive: true });
  const a5Presence = await verifyA5ResourceLanPresence({ args, buildIdentity, env,
    evidenceRoot: path.join(root, 'a5-presence'), fixture, groupId });
  args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'start', '-W', '-n',
    'com.foliole.android.acceptance/com.foliole.android.MainActivity']);
  const paths = await session.invoke('load_library_path_settings');
  const macImage = assertOwnedResourcePath(macosLibrary, paths.assets_dir, fixture.images[0].storageKey);
  if (digest(macImage) !== fixture.images[0].hash) throw new Error('Mac source fixture hash changed.');
  const savedBytes = fs.readFileSync(macImage);
  const iosRoot = args.paths.buildRoot;
  const transfer404 = process.env.FOLIOLE_T203_TRANSFER_404 === '1';
  const mode = resolveIosResourceMode();
  const derivedData = prepareIosAcceptanceCache(iosRoot).derivedData;
  let owned;
  let buildChanged = false;
  let resultPath;
  try {
    fixture.restore();
    if (!transfer404) fs.unlinkSync(macImage);
    owned = createOwnedIosSimulator({ artifactDir: root,
      create: (argv) => command(iosRoot, 'xcrun', argv),
      listAvailable: () => JSON.parse(command(iosRoot, 'xcrun', ['simctl', 'list', 'devices', 'available', '--json'])),
      name: `Foliole T203 provider failover ${process.pid}` });
    const scenarioEnv = { ...ordinaryEnv(), VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1',
      VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO: SCENARIO,
      VITE_FOLIOLE_ACCEPTANCE_GROUP_ID: groupId, VITE_FOLIOLE_ACCEPTANCE_MAC_ID: macDeviceId,
      VITE_FOLIOLE_ACCEPTANCE_A5_ID: a5DeviceId,
      VITE_FOLIOLE_ACCEPTANCE_NODE_ID: fixture.nodeId,
      VITE_FOLIOLE_ACCEPTANCE_IMAGE_HASH: fixture.images[0].hash,
      VITE_FOLIOLE_ACCEPTANCE_TRANSFER_404: transfer404 ? '1' : '0' };
    buildChanged = true;
    heavy(iosRoot, 'npm', ['run', 'android:web:build'], mode, { env: scenarioEnv });
    command(iosRoot, 'npx', ['--no-install', 'cap', 'copy', 'ios']);
    heavy(iosRoot, 'xcodebuild', createSimulatorAcceptanceBuildArgs({ bundleId: BUNDLE_ID,
      derivedData, repoRoot: iosRoot, resourceArgs: iosXcodebuildResourceArgs(mode), udid: owned.udid }), mode);
    command(iosRoot, 'xcrun', ['simctl', 'boot', owned.udid]);
    command(iosRoot, 'xcrun', ['simctl', 'bootstatus', owned.udid, '-b']);
    const app = path.join(derivedData, 'Build/Products/Debug-iphonesimulator/App.app');
    command(iosRoot, 'codesign', ['--verify', '--deep', '--strict', app]);
    const signatureDetails = spawnSync('codesign', ['-d', '--verbose=4', app],
      { cwd: iosRoot, encoding: 'utf8' });
    if (signatureDetails.status !== 0) throw new Error('iOS acceptance signature inspection failed.');
    const signature = verifyAcceptanceAppSignature(
      `${signatureDetails.stdout}${signatureDetails.stderr}`, BUNDLE_ID);
    command(iosRoot, 'xcrun', ['simctl', 'install', owned.udid, app]);
    const container = command(iosRoot, 'xcrun', ['simctl', 'get_app_container', owned.udid,
      BUNDLE_ID, 'data']).trim();
    resultPath = path.join(container, 'Library/FolioleBridgeAcceptance/result.json');
    const iosImage = path.join(container, 'Library/Application Support/attachments',
      fixture.images[0].storageKey);
    command(iosRoot, 'xcrun', ['simctl', 'launch', owned.udid, BUNDLE_ID]);
    const requested = await readResult(resultPath, 'join-requested');
    if (requested.status !== 'passed') throw new Error(requested.error);
    if (transfer404) fs.writeFileSync(path.join(root, 'arm-after-a5-presence'), 'armed\n');
    const joined = await acceptIos();
    const first = await readResult(resultPath, 'provider-selected');
    if (first.status !== 'passed') throw new Error(first.error);
    if (digest(iosImage) !== fixture.images[0].hash) throw new Error('iOS cached resource hash differs from A5.');
    fs.writeFileSync(path.join(root, 'first.json'), `${JSON.stringify(first, null, 2)}\n`);
    command(iosRoot, 'xcrun', ['simctl', 'terminate', owned.udid, BUNDLE_ID]);
    fs.rmSync(resultPath, { force: true });
    command(iosRoot, 'xcrun', ['simctl', 'launch', owned.udid, BUNDLE_ID]);
    const restarted = await readResult(resultPath, 'restart-clean');
    if (restarted.status !== 'passed') throw new Error(restarted.error);
    if (digest(iosImage) !== fixture.images[0].hash) throw new Error('iOS cached resource changed on restart.');
    const claimMarker = path.join(root, 'available-then-removed.json');
    const getMarker = path.join(root, 'first-get-404.json');
    if (transfer404 && (!fs.existsSync(claimMarker) || !fs.existsSync(getMarker))) {
      throw new Error('Mac did not record both its available claim and actual signed GET 404.');
    }
    const result = { sourceHead: args.paths.acceptedRevision ??
      command(iosRoot, 'git', ['rev-parse', 'HEAD']).trim(),
      sourceTreeClean: Boolean(args.paths.acceptedRevision) ||
        !command(iosRoot, 'git', ['status', '--porcelain', '--untracked-files=no']).trim(),
      a5Presence, first, joined, macImageAbsentDuringTransfer: !fs.existsSync(macImage),
      macImageHashBeforeRemoval: fixture.images[0].hash, restarted, signature,
      iosImageHashAfterRestart: fixture.images[0].hash,
      mode: transfer404 ? 'actual-get-404-then-a5' : 'availability-missing-then-a5',
      macClaimBeforeGet: transfer404 ? JSON.parse(fs.readFileSync(claimMarker, 'utf8')) : null,
      macGetFailure: transfer404 ? JSON.parse(fs.readFileSync(getMarker, 'utf8')) : null,
      simulator: owned, topology: ['Mac isolated desktop', 'physical A5 acceptance app',
        'independent iOS Simulator'], status: 'passed' };
    fs.writeFileSync(path.join(root, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } catch (error) {
    fs.writeFileSync(path.join(root, 'failure.json'), `${JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      bridgeResult: resultPath && fs.existsSync(resultPath)
        ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : null
    }, null, 2)}\n`);
    throw error;
  } finally {
    fs.writeFileSync(macImage, savedBytes);
    if (owned) cleanupOwnedIosSimulator({ artifactDir: root, bundleId: BUNDLE_ID, udid: owned.udid,
      captureLog: (argv) => {
        const output = spawnSync('xcrun', argv, { cwd: iosRoot, encoding: 'utf8', timeout: 60_000 });
        return `${output.stdout ?? ''}${output.stderr ?? ''}`;
      },
      runAllowFailure: (argv) => { spawnSync('xcrun', argv, { cwd: iosRoot, stdio: 'ignore' }); } });
    if (owned) assertOwnedSimulatorDeleted(iosRoot, owned.udid);
    if (buildChanged) {
      heavy(iosRoot, 'npm', ['run', 'android:web:build'], mode, { env: ordinaryEnv() });
      command(iosRoot, 'npx', ['--no-install', 'cap', 'copy', 'ios']);
    }
  }
}
