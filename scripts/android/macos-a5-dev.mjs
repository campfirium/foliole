#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertFormalMacosA5Action, assertRegisteredMacosA5Action
} from './macos-a5-action-registry.mjs';
import {
  openMacosA5BuildCapsule
} from './macos-a5-build-capsule.mjs';
import {
  dispatchMacosA5Action, macosA5ErrorEvidence
} from './macos-a5-action-dispatch.mjs';
import { macosA5ActionEnv } from './macos-a5-extended-actions.mjs';
import {
  macosA5AppId, macosA5IdentityEnv, resolveMacosA5Identity
} from './macos-a5-app-identity.mjs';
import { runMacosA5Cli } from './macos-a5-cli.mjs';
import { recordA5PackageIdentity } from './macos-a5-package-identity.mjs';
import {
  createMacosA5CaptureIdentity as captureIdentity,
  runMacosA5CaptureReadiness,
  runMacosA5PairingReadiness
} from './macos-a5-readiness.mjs';
import {
  captureFormalA5Toolchain, formalA5FailureStage, markFormalA5ActionRunning,
  markFormalA5MutationBoundary,
  markFormalA5Stage,
  prepareFormalA5ReceiptCompletion, recordFormalA5DataProtection, recordFormalA5Lease
} from './macos-a5-formal-receipt.mjs';
import {
  finishMacosA5Lifecycle, openMacosA5Lifecycle
} from './macos-a5-formal-lifecycle.mjs';
import { checked, captured, execute } from './macos-a5-process.mjs';
import { cleanupMacosA5Run } from './macos-a5-run-cleanup.mjs';
import { acquireMacosA5DeviceLease } from './macos-a5-run-lease.mjs';
import {
  assertSafeMacosA5Environment, macosA5GradleEnv, macosA5Paths
} from './macos-a5-runtime-paths.mjs';

export { macosA5GradleEnv, macosA5Paths } from './macos-a5-runtime-paths.mjs';

export const A5_SERIAL = '87a33a4b';

export function assertFixedA5(paths) {
  checked(paths.adb, ['start-server']);
  const state = captured(paths.adb, ['-s', A5_SERIAL, 'get-state']);
  if (state !== 'device') throw new Error(`Fixed A5 ${A5_SERIAL} is not ready: ${state || 'missing'}`);
  const devices = captured(paths.adb, ['devices']);
  if (!devices.split('\n').some((line) => line.startsWith(`${A5_SERIAL}\tdevice`))) {
    throw new Error(`Fixed A5 ${A5_SERIAL} is not authorized`);
  }
}

function readiness(paths) {
  runMacosA5CaptureReadiness(checked, paths, A5_SERIAL, macosA5AppId());
}

function pairingReadiness(paths) {
  runMacosA5PairingReadiness(checked, paths, A5_SERIAL, macosA5AppId());
}

export function build(paths, run = checked, onStage = () => {}, env = macosA5GradleEnv()) {
  onStage('web-build');
  run('npm', ['run', 'android:web:build'], { cwd: paths.buildRoot, env });
  onStage('capacitor-sync');
  run(paths.cap, ['sync', 'android'], { cwd: paths.buildRoot, env });
  onStage('gradle-build');
  run(paths.gradle, ['--no-daemon', '--build-cache', 'assembleDebug', 'assembleDebugAndroidTest'], {
    cwd: path.join(paths.buildRoot, 'android'), env
  });
  onStage('apk-check');
  if (!existsSync(paths.apk)) throw new Error(`Debug APK was not produced: ${paths.apk}`);
  if (!existsSync(paths.androidTestApk)) {
    throw new Error(`Android test APK was not produced: ${paths.androidTestApk}`);
  }
}

function launchAndVerify(paths, applicationId = macosA5AppId()) {
  const component = `${applicationId}/com.foliole.android.MainActivity`;
  checked(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'start', '-n', component]);
  checked(process.execPath, [
    path.join(paths.buildRoot, 'scripts/android/verify-android-launch.mjs'),
    '--adb', paths.adb, '--serial', A5_SERIAL, '--app-id', applicationId,
    '--component', component, '--timeout-seconds', '30', '--stability-seconds', '3'
  ], { cwd: paths.buildRoot });
}

async function deploy(
  paths, buildIdentity = captureIdentity, markMutationBoundary = () => {}, buildAction = build,
  applicationId = macosA5AppId()
) {
  assertFixedA5(paths);
  buildAction(paths);
  const env = macosA5GradleEnv();
  const analyzer = path.join(env.ANDROID_SDK_ROOT, 'cmdline-tools/latest/bin/apkanalyzer');
  if (captured(analyzer, ['manifest', 'application-id', paths.apk], { env }) !== applicationId) {
    throw new Error('Built APK does not match the requested installation target.');
  }
  markMutationBoundary();
  const runId = buildIdentity();
  const evidenceRoot = path.join(paths.artifactsRoot, 'a5-deploy', runId);
  mkdirSync(evidenceRoot, { recursive: true });
  checked(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'force-stop', applicationId]);
  checked(paths.adb, ['-s', A5_SERIAL, 'install', '-r', paths.apk]);
  launchAndVerify(paths, applicationId);
  console.log(`[macos-a5-dev] deploy evidence=${evidenceRoot}`);
}

export async function protectData(paths, env, mode, manifest, backupRoot) {
  if (!backupRoot) throw new Error('Transient Android snapshot root is required.');
  const result = await execute(process.execPath, [
    path.join(paths.buildRoot, 'scripts/android/android-device-data-protection.mjs'),
    '--mode', mode, '--adb', paths.adb, '--serial', A5_SERIAL, '--app-id', macosA5AppId(env),
    '--backup-root', backupRoot, '--manifest', manifest
  ], { env, timeoutCode: `data_${mode}_timeout`, timeoutMs: 5 * 60_000 });
  if (result.code !== 0) throw Object.assign(new Error(`Data protection ${mode} failed`), { result });
  return result;
}

export async function captureAnnotation(
  paths, buildIdentity = captureIdentity, markMutationBoundary = () => {}, buildAction = build
) {
  assertFixedA5(paths);
  readiness(paths);
  buildAction(paths);
  const runId = buildIdentity();
  const evidenceRoot = path.join(paths.artifactsRoot, 'a5-capture-annotation', runId);
  const env = macosA5GradleEnv();
  markMutationBoundary();
  const { runA5CaptureAnnotation } = await import('./android-a5-capture-annotation-action.mjs');
  let failure;
  const result = await runA5CaptureAnnotation({
    adbPort: '5037', appId: macosA5AppId(), buildIdentity: runId, env, evidenceRoot, execute, paths: {
      adbPath: paths.adb, buildRoot: paths.buildRoot
    },
    protectData: (mode, manifest, backupRoot) => protectData(paths, env, mode, manifest, backupRoot),
    serial: A5_SERIAL
  }).catch((error) => { failure = error; });
  try { launchAndVerify(paths); }
  catch (error) {
    if (!failure) throw error;
    failure.foregroundRestoreError = error;
  }
  if (failure) throw failure;
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] capture-annotation evidence=${result.captureAnnotation.manifestPath}`);
}

export async function runMacosA5Action(
  action, repoRoot = process.cwd(), { formal = false, identity, revision } = {}
) {
  const actionContract = assertRegisteredMacosA5Action(action);
  // One CLI run owns one application identity; child runners inherit it through the environment.
  const identityEnv = macosA5IdentityEnv(process.env, resolveMacosA5Identity(action, identity));
  for (const key of Object.keys(process.env)) if (!(key in identityEnv)) delete process.env[key];
  Object.assign(process.env, identityEnv);
  if (formal) assertFormalMacosA5Action(actionContract);
  if (revision && (!formal || actionContract.formalSourceClass !== 'frozen-build')) {
    throw new Error('--revision is only supported for formal build actions.');
  }
  const lifecycle = openMacosA5Lifecycle({ action, actionContract, formal, repoRoot, revision });
  let { context } = lifecycle;
  const { receipt, sharedCacheRoot, taskId } = lifecycle;
  let lease;
  let failure;
  let failedStage;
  try {
    if (formal && actionContract.formalSourceClass === 'frozen-build') {
      context = openMacosA5BuildCapsule(context, {
        onStage: (stage) => markFormalA5Stage(receipt, `capsule-${stage}`)
      });
    }
    const paths = macosA5Paths(context);
    const actionEnv = macosA5GradleEnv({
      ...macosA5ActionEnv(process.env, formal, actionContract.requiresHiddenDesktopRuntime),
      FOLIOLE_SHARED_CACHE_ROOT: sharedCacheRoot
    });
    assertSafeMacosA5Environment(paths);
    if (receipt) captureFormalA5Toolchain(receipt, paths, (command, args, options) =>
      spawnSync(command, args, { ...options, env: actionEnv }));
    if (actionContract.deviceLeaseMode) {
      lease = acquireMacosA5DeviceLease(context, actionContract.deviceLeaseMode);
      if (receipt) recordFormalA5Lease(receipt, lease);
    }
    const runProtection = async (mode, manifest, backupRoot) => {
      const result = await protectData(paths, actionEnv, mode, manifest, backupRoot);
      if (receipt && mode === 'backup') recordFormalA5DataProtection(receipt, manifest);
      return result;
    };
    if (receipt && actionContract.mutatesFixedA5 && actionContract.requiresDataProtection !== false) {
      markFormalA5Stage(receipt, 'data-protection');
      assertFixedA5(paths);
      checked(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'force-stop', macosA5AppId()]);
      await runProtection('backup', path.join(path.dirname(receipt.path), 'device-baseline.json'),
        path.join(context.deviceBackupRoot, context.runId));
    }
    if (receipt) (actionContract.mutatesFixedA5
      ? markFormalA5Stage(receipt, 'action-preflight') : markFormalA5ActionRunning(receipt));
    const buildIdentity = formal ? () => context.runId : captureIdentity;
    const runBuild = (actionPaths) => build(actionPaths, checked,
      (stage) => receipt && markFormalA5Stage(receipt, stage), actionEnv);
    await dispatchMacosA5Action({ action, assertFixed: assertFixedA5, build: runBuild, buildIdentity,
      captureAnnotation, captured, checked, deploy, env: actionEnv, execute,
      markMutationBoundary: () => receipt && markFormalA5MutationBoundary(receipt),
      pairingReadiness, paths,
      protectData: runProtection, readiness, serial: A5_SERIAL });
    const packageIdentity = actionContract.formalSourceClass === 'frozen-build'
      && action !== 'bundle-release' && existsSync(paths.apk)
      ? recordA5PackageIdentity({ captured, context, env: actionEnv, paths }) : null;
    if (receipt) {
      markFormalA5Stage(receipt, 'action-evidence');
      prepareFormalA5ReceiptCompletion(receipt, context, paths, undefined, packageIdentity);
    }
  } catch (error) {
    failure = error;
    failedStage = formalA5FailureStage(error, receipt?.receipt.stage);
  }
  const cleanupError = cleanupMacosA5Run({ actionFailed: Boolean(failure),
    adb: macosA5Paths(context).adb, context, deviceLeaseMode: actionContract.deviceLeaseMode,
    lease, receipt });
  if (!failure && cleanupError) { failure = cleanupError; failedStage = 'cleanup'; }
  finishMacosA5Lifecycle({ actionContract, context, failedStage, failure, receipt, taskId });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runMacosA5Cli({ argv: process.argv.slice(2), errorEvidence: macosA5ErrorEvidence,
    repoRoot: process.cwd(), run: runMacosA5Action });
}
