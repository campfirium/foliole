import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseCaptureAnnotationReadiness } from './windows-a5-capture-annotation-contract.mjs';
import {
  PAIR_SYNC_RECOVERY_APP_ID, PAIR_SYNC_RECOVERY_EVIDENCE_FILES,
  PAIR_SYNC_RECOVERY_TEST_APP_ID, PAIR_SYNC_RECOVERY_TEST_CLASS,
  PAIR_SYNC_RECOVERY_TEST_RUNNER, pairSyncRecoveryArtifactPaths,
  pairSyncRecoveryFailure, parsePairSyncRecoveryInstrumentation
} from './windows-a5-pair-sync-recovery-contract.mjs';
import {
  openPairSyncDesktopSession, waitForUniquePairRequest
} from './windows-pair-sync-desktop-session.mjs';

const MAIN_APK = 'android/app/build/outputs/apk/debug/app-debug.apk';
const TEST_APK = 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk';
const MAIN_COMPONENT = `${PAIR_SYNC_RECOVERY_APP_ID}/com.foliole.android.MainActivity`;

function options(env, timeoutCode, timeoutMs) {
  return { env, timeoutCode, timeoutMs, windowsHide: true };
}

async function checked(execute, command, args, commandOptions, stage) {
  let result;
  try { result = await execute(command, args, commandOptions); }
  catch (error) { throw pairSyncRecoveryFailure(error.message, stage, error); }
  if (result.code === 0) return result;
  throw pairSyncRecoveryFailure(result.lines?.at(-1) || `${command} exited ${result.code}`, stage, result);
}

function writeJson(fsApi, filePath, value) {
  fsApi.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function sanitizePairSyncDataProtection(manifest) {
  if (manifest?.schemaVersion === 1 && typeof manifest.backupCreated === 'boolean'
      && manifest.databasePreserved === true) {
    return {
      backupCreated: manifest.backupCreated,
      databasePreserved: true,
      nodeCountBefore: Number.isInteger(manifest.nodeCountBefore) ? manifest.nodeCountBefore : null,
      schemaVersion: 1
    };
  }
  const counts = manifest?.snapshot?.database?.counts ?? {};
  return {
    backupCreated: manifest?.backup?.created === true,
    databasePreserved: true,
    nodeCountBefore: Number.isInteger(counts.nodes) ? counts.nodes : null,
    schemaVersion: 1
  };
}

function scrubDataProtectionManifest(fsApi, filePath) {
  if (!fsApi.existsSync(filePath)) return;
  try {
    writeJson(fsApi, filePath, sanitizePairSyncDataProtection(JSON.parse(fsApi.readFileSync(filePath, 'utf8'))));
  } catch {
    fsApi.unlinkSync(filePath);
  }
}

function apk(fsApi, repoRoot, relativePath) {
  const filePath = path.join(repoRoot, ...relativePath.split('/'));
  if (!fsApi.existsSync(filePath)) throw pairSyncRecoveryFailure(`Built APK is missing: ${relativePath}`, 'built-apk');
  return {
    filePath, relativePath,
    sha256: createHash('sha256').update(fsApi.readFileSync(filePath)).digest('hex'),
    size: fsApi.statSync(filePath).size
  };
}

async function install(execute, paths, env, adbPort, serial, filePath, testOnly) {
  const result = await checked(execute, paths.adbPath,
    ['-P', adbPort, '-s', serial, 'install', '-r', ...(testOnly ? ['-t'] : []), filePath],
    options(env, 'pair_sync_install_timeout', 5 * 60_000), testOnly ? 'test-apk-install' : 'main-apk-install');
  if (!/^Success\s*$/mu.test(result.stdout)) {
    throw pairSyncRecoveryFailure('ADB install did not report Success', 'apk-install', result);
  }
  return result.output;
}

async function clientControl(execute, paths, env, action) {
  const script = path.join(paths.repoRoot, 'scripts', 'windows', 'windows-client-native.mjs');
  return checked(execute, paths.systemNode, [script, action],
    options(env, 'desktop_client_timeout', 2 * 60_000), `desktop-client-${action}`);
}

function validateDesktopPreflight(overview, session, deviceFingerprint, remotePeerFingerprint = null) {
  const safe = session.sanitize(overview);
  const wrongPairedDevice = safe.pairedDeviceFingerprints.some((value) => value !== deviceFingerprint);
  const wrongRemotePeer = remotePeerFingerprint
    && safe.desktopPeerFingerprint !== remotePeerFingerprint;
  if (!safe.desktopPeerFingerprint || safe.pendingDeviceFingerprints.length > 0
      || wrongPairedDevice || wrongRemotePeer
      || safe.pairedDeviceFingerprints.length > 1) {
    throw pairSyncRecoveryFailure(
      'Windows current library pairing state requires user review', 'desktop-pairing-readiness', null, 77
    );
  }
  return safe;
}

export async function inspectWindowsPairSyncRecoveryDesktop({
  deviceFingerprint, env, execute, openDesktopSession = openPairSyncDesktopSession,
  paths, remotePeerFingerprint
}) {
  const output = [];
  await clientControl(execute, paths, env, 'stop');
  let session;
  try {
    session = await openDesktopSession({ env, repoRoot: paths.repoRoot });
    const overview = validateDesktopPreflight(
      await session.load(), session, deviceFingerprint, remotePeerFingerprint
    );
    return { output: output.join(''), overview };
  } finally {
    await session?.close();
    output.push((await clientControl(execute, paths, env, 'start')).output);
  }
}

async function postRecoveryReadiness(execute, paths, env, serial) {
  const script = path.join(paths.repoRoot, 'scripts', 'android', 'android-capture-annotation-readiness-runner.mjs');
  const result = await checked(execute, paths.systemNode, [
    script, '--adb', paths.adbPath, '--serial', serial, '--app-id', PAIR_SYNC_RECOVERY_APP_ID
  ], options(env, 'pair_sync_readiness_timeout', 60_000), 'post-sync-readiness');
  const readiness = parseCaptureAnnotationReadiness(result.stdout);
  if (readiness.resultStatus !== 'ready') {
    throw pairSyncRecoveryFailure('Recovered Android workspace is not ready', 'post-sync-readiness', result);
  }
  return { output: result.output, readiness };
}

async function cleanupTestPackage(execute, paths, env, adbPort, serial) {
  const result = await checked(execute, paths.adbPath,
    ['-P', adbPort, '-s', serial, 'uninstall', PAIR_SYNC_RECOVERY_TEST_APP_ID],
    options(env, 'pair_sync_cleanup_timeout', 60_000), 'pair-sync-cleanup');
  if (!/^Success\s*$/mu.test(result.stdout)) {
    throw pairSyncRecoveryFailure('Test APK cleanup did not report Success', 'pair-sync-cleanup', result);
  }
  return result.output;
}

export async function runWindowsA5PairSyncRecovery({
  adbPort, buildIdentity, deviceFingerprint, env, evidenceRoot, execute, fsApi = fs,
  openDesktopSession = openPairSyncDesktopSession, paths, protectData, remotePeerFingerprint, serial
}) {
  const artifacts = pairSyncRecoveryArtifactPaths(evidenceRoot);
  const dataManifest = artifacts['pair-sync-recovery-data-protection.json'];
  const builtApks = { main: apk(fsApi, paths.repoRoot, MAIN_APK), test: apk(fsApi, paths.repoRoot, TEST_APK) };
  const output = [];
  let session;
  let testInstalled = false;
  let primaryError = null;
  let instrumentationPromise = null;
  let proof;
  await clientControl(execute, paths, env, 'stop');
  try {
    const before = await protectData('backup', dataManifest);
    output.push(before.output);
    output.push(await install(execute, paths, env, adbPort, serial, builtApks.main.filePath, false));
    output.push(await install(execute, paths, env, adbPort, serial, builtApks.test.filePath, true));
    testInstalled = true;
    output.push((await protectData('check', dataManifest)).output);
    scrubDataProtectionManifest(fsApi, dataManifest);
    session = await openDesktopSession({ env, repoRoot: paths.repoRoot });
    const enabled = await session.enable();
    validateDesktopPreflight(enabled, session, deviceFingerprint, remotePeerFingerprint);
    instrumentationPromise = checked(execute, paths.adbPath, [
      '-P', adbPort, '-s', serial, 'shell', 'am', 'instrument', '-w', '-r',
      '-e', 'class', PAIR_SYNC_RECOVERY_TEST_CLASS, PAIR_SYNC_RECOVERY_TEST_RUNNER
    ], options(env, 'pair_sync_instrumentation_timeout', 3 * 60_000), 'pair-sync-instrumentation');
    const pending = await waitForUniquePairRequest(session, deviceFingerprint);
    await session.approve(pending.pair_request_id);
    const instrumentation = await instrumentationPromise;
    output.push(instrumentation.output);
    const receipt = parsePairSyncRecoveryInstrumentation(instrumentation.stdout);
    await checked(execute, paths.adbPath,
      ['-P', adbPort, '-s', serial, 'shell', 'am', 'force-stop', PAIR_SYNC_RECOVERY_APP_ID],
      options(env, 'pair_sync_restart_timeout', 30_000), 'pair-sync-restart');
    await checked(execute, paths.adbPath,
      ['-P', adbPort, '-s', serial, 'shell', 'am', 'start', '-W', '-n', MAIN_COMPONENT],
      options(env, 'pair_sync_restart_timeout', 60_000), 'pair-sync-restart');
    const android = await postRecoveryReadiness(execute, paths, env, serial);
    output.push(android.output);
    const desktop = session.sanitize(await session.load());
    if (!desktop.pairedDeviceFingerprints.includes(deviceFingerprint)) {
      throw pairSyncRecoveryFailure('Windows pairing overview does not contain the fixed A5', 'desktop-pairing-result');
    }
    proof = { android: android.readiness, desktop, receipt };
  } catch (error) {
    primaryError = error;
    await instrumentationPromise?.catch(() => undefined);
  }
  scrubDataProtectionManifest(fsApi, dataManifest);
  try {
    if (testInstalled) output.push(await cleanupTestPackage(execute, paths, env, adbPort, serial));
  } catch (error) {
    primaryError ??= error;
  }
  try { await session?.close(); }
  catch (error) { primaryError ??= error; }
  try { output.push((await clientControl(execute, paths, env, 'start')).output); }
  catch (error) { primaryError ??= error; }
  if (primaryError) {
    if (!primaryError.result?.output) primaryError.result = { output: output.join('') };
    throw primaryError;
  }
  writeJson(fsApi, artifacts['pair-sync-recovery-receipt.json'], proof.receipt);
  writeJson(fsApi, artifacts['pair-sync-recovery-android-readiness.json'], proof.android);
  writeJson(fsApi, artifacts['pair-sync-recovery-desktop-overview.json'], proof.desktop);
  const manifest = {
    action: 'pair-sync-recover', artifacts: Object.fromEntries(
      PAIR_SYNC_RECOVERY_EVIDENCE_FILES.slice(1).map((name) => [name, name])
    ), buildIdentity, cleanup: { desktopRuntimeClosed: true, testPackageRemoved: true },
    deviceIdentityFingerprint: deviceFingerprint, resultStatus: 'success', schemaVersion: 1,
    serialFingerprint: createHash('sha256').update(serial).digest('hex').slice(0, 16)
  };
  writeJson(fsApi, artifacts['pair-sync-recovery-manifest.json'], manifest);
  return {
    output: output.join(''),
    pairSyncRecovery: { buildIdentity, manifestPath: artifacts['pair-sync-recovery-manifest.json'] }
  };
}
