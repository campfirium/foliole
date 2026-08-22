import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  PAIR_SYNC_RECOVERY_APP_ID, PAIR_SYNC_RECOVERY_EVIDENCE_FILES, PAIR_SYNC_RECOVERY_MAIN_COMPONENT,
  PAIR_SYNC_RECOVERY_TEST_APP_ID, PAIR_SYNC_RECOVERY_TEST_CLASS,
  PAIR_SYNC_RECOVERY_TEST_RUNNER, pairSyncRecoveryArtifactPaths,
  createPairSyncRecoveryEvidenceTracker, pairSyncRecoveryFailure,
  pairSyncRecoveryModeArgs, pairSyncRecoveryRequiresApproval, parsePairSyncRecoveryInstrumentationResult
} from './windows-a5-pair-sync-recovery-contract.mjs';
import { checkedPairSyncCommand } from './windows-a5-pair-sync-command.mjs';
import { createPairSyncRecoveryWindow, resolvePairSyncConcurrentFailure } from './windows-a5-pair-sync-recovery-concurrency.mjs';
import { collectPairSyncRecoveryFailureEvidence } from './windows-a5-pair-sync-recovery-failure-evidence.mjs';
import { postPairSyncRecoveryReadiness } from './windows-a5-pair-sync-recovery-readiness.mjs';
import { collectPairSyncHostStage } from './windows-a5-pair-sync-host-stage.mjs';
import {
  openPairSyncDesktopSession, waitForUniquePairRequest
} from './windows-pair-sync-desktop-session.mjs';
import {
  inspectAuthorizedDesktopPreflight, validateOwnedDesktopPreflight
} from './windows-pair-sync-desktop-readiness.mjs';
import { cleanupPairSyncRecoveryTestPackage, closePairSyncRecoveryTransport, openPairSyncRecoveryTransport } from './windows-a5-pair-sync-recovery-transport.mjs';

const MAIN_APK = 'android/app/build/outputs/apk/debug/app-debug.apk';
const TEST_APK = 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk';
function options(env, timeoutCode, timeoutMs) {
  return { env, timeoutCode, timeoutMs, windowsHide: true };
}

const checked = checkedPairSyncCommand;

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
  desktopAuthorizationFingerprint, env, execute, existingPairing = false,
  hostName, openDesktopSession = openPairSyncDesktopSession, paths
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
    overview = await inspectAuthorizedDesktopPreflight(
      await desktopStep('desktop-pairing-load', () => session.load()),
      session, hostName, desktopAuthorizationFingerprint, existingPairing
    );
  } catch (error) { primaryError = error; }
  try { await session?.close(); }
  catch (error) { primaryError ??= pairSyncRecoveryFailure(error.message, 'desktop-session-close', error); }
  try { output.push((await clientControl(execute, paths, env, 'start')).output); }
  catch (error) { primaryError ??= error; }
  if (primaryError) throw primaryError;
  return { output: output.join(''), overview };
}

function pairSyncAdbRunner(execute, paths, env, adbPort, serial) {
  return (args, stage) => checked(execute, paths.adbPath,
    ['-P', adbPort, '-s', serial, ...args], options(env, 'pair_sync_transport_timeout', 30_000), stage);
}

export async function runWindowsA5PairSyncRecovery({
  adbPort, buildIdentity, env, evidenceRoot, execute, fsApi = fs, hostName,
  credentialRepairRequired = false, existingPairing = false, openDesktopSession = openPairSyncDesktopSession,
  desktopControl = clientControl, openTransport = openPairSyncRecoveryTransport,
  closeTransport = closePairSyncRecoveryTransport,
  approvalMembershipAction,
  approvalRequired,
  recoveryEvidenceGoal = 'initial-sync-completed',
  instrumentationModeArgs = pairSyncRecoveryModeArgs,
  pairedAuthorizationFingerprint = null, pairRequestIdentity = hostName,
  waitForPairRequest = waitForUniquePairRequest,
  validateDesktop = validateOwnedDesktopPreflight, paths,
  desktopAuthorizationFingerprint, serial
}) {
  const artifacts = pairSyncRecoveryArtifactPaths(evidenceRoot);
  const builtApks = { main: apk(fsApi, paths.repoRoot, MAIN_APK), test: apk(fsApi, paths.repoRoot, TEST_APK) };
  const output = [];
  let session;
  let transportOpen = false;
  let testInstalled = false;
  let primaryError = null;
  let instrumentationPromise = null;
  let proof;
  let receipt;
  const recoveryEvidence = createPairSyncRecoveryEvidenceTracker(recoveryEvidenceGoal);
  await desktopControl(execute, paths, env, 'stop');
  try {
    output.push(await install(execute, paths, env, adbPort, serial, builtApks.main.filePath, false));
    output.push(await install(execute, paths, env, adbPort, serial, builtApks.test.filePath, true));
    testInstalled = true;
    session = await desktopStep('desktop-session-open', () => openDesktopSession({
      env, repoRoot: paths.repoRoot
    }));
    const enabled = await desktopStep('desktop-sync-enable', () => session.enable());
    const desktopReadiness = await desktopStep('desktop-runtime-ownership', () => validateDesktop(
      enabled, session, hostName, desktopAuthorizationFingerprint, existingPairing,
      credentialRepairRequired
    ));
    const rePairRequired = desktopReadiness.rePairRequired === true;
    await openTransport(pairSyncAdbRunner(execute, paths, env, adbPort, serial));
    transportOpen = true;
    await desktopStep('desktop-runtime-ownership', () => session.assertActive());
    const recoveryWindow = createPairSyncRecoveryWindow();
    instrumentationPromise = checked(execute, paths.adbPath, [
      '-P', adbPort, '-s', serial, 'shell', 'am', 'instrument', '-w', '-r',
      ...instrumentationModeArgs(rePairRequired),
      '-e', 'foliolePairSyncRunId', buildIdentity,
      '-e', 'class', PAIR_SYNC_RECOVERY_TEST_CLASS, PAIR_SYNC_RECOVERY_TEST_RUNNER
    ], options(env, 'pair_sync_instrumentation_timeout', recoveryWindow.instrumentationTimeoutMs), 'pair-sync-instrumentation');
    const requiresApproval = approvalRequired
      ?? pairSyncRecoveryRequiresApproval(existingPairing, rePairRequired);
    if (requiresApproval) await desktopStep('desktop-pair-request', async () => {
      const pending = await recoveryWindow.waitForPairRequest(
        waitForPairRequest(session, pairRequestIdentity, recoveryWindow), instrumentationPromise
      );
      await recoveryEvidence.approve(session, pending, approvalMembershipAction);
    });
    const instrumentation = await instrumentationPromise;
    output.push(instrumentation.output);
    receipt = recoveryEvidence.complete(parsePairSyncRecoveryInstrumentationResult(instrumentation));
    await checked(execute, paths.adbPath,
      ['-P', adbPort, '-s', serial, 'shell', 'am', 'force-stop', PAIR_SYNC_RECOVERY_APP_ID],
      options(env, 'pair_sync_restart_timeout', 30_000), 'pair-sync-restart');
    await checked(execute, paths.adbPath,
      ['-P', adbPort, '-s', serial, 'shell', 'am', 'start', '-W', '-n', PAIR_SYNC_RECOVERY_MAIN_COMPONENT],
      options(env, 'pair_sync_restart_timeout', 60_000), 'pair-sync-restart');
    const android = await postPairSyncRecoveryReadiness({
      adbPort, env, paths, quiesceProvider: true, serial,
      run: (command, args, commandOptions, stage) => checked(
        execute, command, args, commandOptions, stage
      )
    });
    output.push(android.output);
    const desktop = session.sanitize(await desktopStep('desktop-pairing-result', () => session.load()));
    const expectedAuthorization = pairedAuthorizationFingerprint
      ?? android.readiness.localMemberAuthorizationFingerprint;
    if (!desktop.pairedAuthorizationFingerprints.includes(expectedAuthorization)) {
      throw pairSyncRecoveryFailure('Desktop pairing overview does not contain the A5 authorization', 'desktop-pairing-result');
    }
    proof = { android: android.readiness, desktop, receipt };
  } catch (error) {
    primaryError = await resolvePairSyncConcurrentFailure(error, instrumentationPromise);
    primaryError.pairSyncHostStage = await collectPairSyncHostStage({
      adbPort, buildIdentity, env, execute, paths, serial
    });
    primaryError.pairSyncAndroidEvidence ??= receipt ?? null;
    primaryError.pairSyncRecoveryEvidence = recoveryEvidence.failure(primaryError);
    primaryError.pairSyncFailureEvidence = await collectPairSyncRecoveryFailureEvidence({
      adbPort, env, error: primaryError, evidenceRoot, execute, fsApi, paths, serial, session
    });
  }
  try {
    if (transportOpen) {
      await closeTransport(pairSyncAdbRunner(execute, paths, env, adbPort, serial));
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
  try { output.push((await desktopControl(execute, paths, env, 'start')).output); }
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
    hostName, localAuthorizationFingerprint: proof.android.localMemberAuthorizationFingerprint,
    resultStatus: 'success', schemaVersion: 1,
    serialFingerprint: createHash('sha256').update(serial).digest('hex').slice(0, 16)
  };
  writeJson(fsApi, artifacts['pair-sync-recovery-manifest.json'], manifest);
  return {
    output: output.join(''),
    pairSyncRecovery: { buildIdentity, manifestPath: artifacts['pair-sync-recovery-manifest.json'] }
  };
}
