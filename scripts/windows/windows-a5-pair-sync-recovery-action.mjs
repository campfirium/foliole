import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseCaptureAnnotationReadiness } from './windows-a5-capture-annotation-contract.mjs';
import {
  PAIR_SYNC_RECOVERY_APP_ID, PAIR_SYNC_RECOVERY_EVIDENCE_FILES, PAIR_SYNC_RECOVERY_MAIN_COMPONENT,
  PAIR_SYNC_RECOVERY_TEST_APP_ID, PAIR_SYNC_RECOVERY_TEST_CLASS,
  PAIR_SYNC_RECOVERY_TEST_RUNNER, pairSyncRecoveryArtifactPaths,
  classifyPairSyncRecoveryActionFailure, createPairSyncRecoveryEvidenceTracker, pairSyncRecoveryFailure,
  parsePairSyncRecoveryInstrumentation
} from './windows-a5-pair-sync-recovery-contract.mjs';
import { createPairSyncRecoveryWindow, resolvePairSyncConcurrentFailure
} from './windows-a5-pair-sync-recovery-concurrency.mjs';
import { scrubPairSyncDataProtection } from './windows-a5-pair-sync-recovery-evidence.mjs';
import { collectPairSyncRecoveryFailureEvidence } from './windows-a5-pair-sync-recovery-failure-evidence.mjs';
import {
  openPairSyncDesktopSession, waitForUniquePairRequest
} from './windows-pair-sync-desktop-session.mjs';
import {
  reconcileAuthorizedStalePairing, validateOwnedDesktopPreflight
} from './windows-pair-sync-desktop-readiness.mjs';
import { cleanupPairSyncRecoveryTestPackage, closePairSyncRecoveryTransport, openPairSyncRecoveryTransport } from './windows-a5-pair-sync-recovery-transport.mjs';

const MAIN_APK = 'android/app/build/outputs/apk/debug/app-debug.apk';
const TEST_APK = 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk';
function options(env, timeoutCode, timeoutMs) {
  return { env, timeoutCode, timeoutMs, windowsHide: true };
}

async function checked(execute, command, args, commandOptions, stage) {
  let result;
  try { result = await execute(command, args, commandOptions); }
  catch (error) {
    throw classifyPairSyncRecoveryActionFailure(
      pairSyncRecoveryFailure(error.message, stage, error), stage, error.output
    );
  }
  if (result.code === 0) return result;
  const failure = pairSyncRecoveryFailure(result.lines?.at(-1) || `${command} exited ${result.code}`, stage, result);
  throw classifyPairSyncRecoveryActionFailure(failure, stage, result.output);
}

function writeJson(fsApi, filePath, value) {
  fsApi.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

async function desktopStep(stage, action) {
  try { return await action(); }
  catch (error) {
    if (error?.stage) throw error;
    throw pairSyncRecoveryFailure(error.message, stage, error);
  }
}

export async function inspectWindowsPairSyncRecoveryDesktop({
  deviceFingerprint, env, execute, existingPairing = false, openDesktopSession = openPairSyncDesktopSession,
  paths, remotePeerFingerprint
}) {
  const output = [];
  await clientControl(execute, paths, env, 'stop');
  let session;
  let primaryError = null;
  let overview;
  try {
    session = await desktopStep('desktop-session-open', () => openDesktopSession({
      env, repoRoot: paths.repoRoot
    }));
    overview = await reconcileAuthorizedStalePairing(
      await desktopStep('desktop-pairing-load', () => session.load()),
      session, deviceFingerprint, remotePeerFingerprint, existingPairing
    );
  } catch (error) { primaryError = error; }
  try { await session?.close(); }
  catch (error) { primaryError ??= pairSyncRecoveryFailure(error.message, 'desktop-session-close', error); }
  try { output.push((await clientControl(execute, paths, env, 'start')).output); }
  catch (error) { primaryError ??= error; }
  if (primaryError) throw primaryError;
  return { output: output.join(''), overview };
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

function pairSyncAdbRunner(execute, paths, env, adbPort, serial) {
  return (args, stage) => checked(execute, paths.adbPath,
    ['-P', adbPort, '-s', serial, ...args], options(env, 'pair_sync_transport_timeout', 30_000), stage);
}

export async function runWindowsA5PairSyncRecovery({
  adbPort, buildIdentity, deviceFingerprint, env, evidenceRoot, execute, fsApi = fs,
  existingPairing = false, openDesktopSession = openPairSyncDesktopSession, paths, protectData,
  remotePeerFingerprint, serial
}) {
  const artifacts = pairSyncRecoveryArtifactPaths(evidenceRoot);
  const dataManifest = artifacts['pair-sync-recovery-data-protection.json'];
  const builtApks = { main: apk(fsApi, paths.repoRoot, MAIN_APK), test: apk(fsApi, paths.repoRoot, TEST_APK) };
  const output = [];
  let session;
  let transportOpen = false;
  let testInstalled = false;
  let primaryError = null;
  let instrumentationPromise = null;
  let proof;
  const recoveryEvidence = createPairSyncRecoveryEvidenceTracker();
  await clientControl(execute, paths, env, 'stop');
  try {
    const before = await protectData('backup', dataManifest);
    output.push(before.output);
    output.push(await install(execute, paths, env, adbPort, serial, builtApks.main.filePath, false));
    output.push(await install(execute, paths, env, adbPort, serial, builtApks.test.filePath, true));
    testInstalled = true;
    output.push((await protectData('check', dataManifest)).output);
    scrubPairSyncDataProtection(fsApi, dataManifest);
    session = await desktopStep('desktop-session-open', () => openDesktopSession({
      env, repoRoot: paths.repoRoot
    }));
    const enabled = await desktopStep('desktop-sync-enable', () => session.enable());
    await desktopStep('desktop-runtime-ownership', () => validateOwnedDesktopPreflight(
      enabled, session, deviceFingerprint, remotePeerFingerprint, existingPairing
    ));
    await openPairSyncRecoveryTransport(pairSyncAdbRunner(execute, paths, env, adbPort, serial));
    transportOpen = true;
    await desktopStep('desktop-runtime-ownership', () => session.assertActive());
    const recoveryWindow = createPairSyncRecoveryWindow();
    instrumentationPromise = checked(execute, paths.adbPath, [
      '-P', adbPort, '-s', serial, 'shell', 'am', 'instrument', '-w', '-r',
      '-e', 'class', PAIR_SYNC_RECOVERY_TEST_CLASS, PAIR_SYNC_RECOVERY_TEST_RUNNER
    ], options(env, 'pair_sync_instrumentation_timeout', recoveryWindow.instrumentationTimeoutMs), 'pair-sync-instrumentation');
    if (!existingPairing) {
      const pending = await desktopStep('desktop-pair-request', () =>
        recoveryWindow.waitForPairRequest(
          waitForUniquePairRequest(session, deviceFingerprint, recoveryWindow), instrumentationPromise
        ));
      await desktopStep('desktop-pair-approval', () => recoveryEvidence.approve(session, pending));
    }
    const instrumentation = await instrumentationPromise;
    output.push(instrumentation.output);
    const receipt = recoveryEvidence.complete(parsePairSyncRecoveryInstrumentation(instrumentation.stdout));
    await checked(execute, paths.adbPath,
      ['-P', adbPort, '-s', serial, 'shell', 'am', 'force-stop', PAIR_SYNC_RECOVERY_APP_ID],
      options(env, 'pair_sync_restart_timeout', 30_000), 'pair-sync-restart');
    await checked(execute, paths.adbPath,
      ['-P', adbPort, '-s', serial, 'shell', 'am', 'start', '-W', '-n', PAIR_SYNC_RECOVERY_MAIN_COMPONENT],
      options(env, 'pair_sync_restart_timeout', 60_000), 'pair-sync-restart');
    const android = await postRecoveryReadiness(execute, paths, env, serial);
    output.push(android.output);
    const desktop = session.sanitize(await desktopStep('desktop-pairing-result', () => session.load()));
    if (!desktop.pairedDeviceFingerprints.includes(deviceFingerprint)) {
      throw pairSyncRecoveryFailure('Windows pairing overview does not contain the fixed A5', 'desktop-pairing-result');
    }
    proof = { android: android.readiness, desktop, receipt };
  } catch (error) {
    primaryError = await resolvePairSyncConcurrentFailure(error, instrumentationPromise);
    primaryError.pairSyncRecoveryEvidence = recoveryEvidence.failure(primaryError);
    primaryError.pairSyncFailureEvidence = await collectPairSyncRecoveryFailureEvidence({
      adbPort, env, evidenceRoot, execute, fsApi, paths, serial, session
    });
  }
  scrubPairSyncDataProtection(fsApi, dataManifest);
  try {
    if (transportOpen) {
      await closePairSyncRecoveryTransport(pairSyncAdbRunner(execute, paths, env, adbPort, serial));
    }
  } catch (error) { primaryError ??= error; }
  try {
    if (testInstalled) output.push(await cleanupPairSyncRecoveryTestPackage(
      pairSyncAdbRunner(execute, paths, env, adbPort, serial), PAIR_SYNC_RECOVERY_TEST_APP_ID
    ));
  } catch (error) {
    primaryError ??= error;
  }
  try { await session?.close(); }
  catch (error) { primaryError ??= pairSyncRecoveryFailure(error.message, 'desktop-session-close', error); }
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
