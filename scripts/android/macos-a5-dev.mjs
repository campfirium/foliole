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
import { runMacosA5Cli } from './macos-a5-cli.mjs';
import {
  closeMacosA5Run, createMacosA5ExecutionContext, openMacosA5Run
} from './macos-a5-execution-context.mjs';
import {
  createMacosA5CaptureIdentity as captureIdentity,
  runMacosA5CaptureReadiness,
  runMacosA5PairingReadiness
} from './macos-a5-readiness.mjs';
import {
  beginFormalA5Candidate
} from './macos-a5-formal-candidate.mjs';
import {
  captureFormalA5Toolchain, completeFormalA5Receipt, failFormalA5Receipt,
  formalA5AcceptedTipLine, formalA5FailureStage, markFormalA5ActionRunning,
  markFormalA5MutationBoundary,
  markFormalA5Stage, openFormalA5Receipt,
  prepareFormalA5ReceiptCompletion
} from './macos-a5-formal-receipt.mjs';
import { checked, captured, execute } from './macos-a5-process.mjs';
import { cleanupMacosA5Run } from './macos-a5-run-cleanup.mjs';
import { acquireMacosA5DeviceLease } from './macos-a5-run-lease.mjs';

export const A5_SERIAL = '87a33a4b';
const APP_ID = 'com.foliole.android';
const COMPONENT = `${APP_ID}/.MainActivity`;
const SDK_ROOT = '/opt/homebrew/share/android-commandlinetools';
const JAVA_HOME = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';

export function macosA5Paths(contextOrRepoRoot) {
  const context = typeof contextOrRepoRoot === 'string'
    ? createMacosA5ExecutionContext({ action: 'legacy-helper', repoRoot: contextOrRepoRoot })
    : contextOrRepoRoot;
  return {
    adb: path.join(SDK_ROOT, 'platform-tools', 'adb'),
    ...context,
    apk: path.join(context.buildRoot, 'android/app/build/outputs/apk/debug/app-debug.apk'),
    cap: path.join(context.buildRoot, 'node_modules/.bin/cap'),
    electron: path.join(context.buildRoot,
      'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    electronPackage: path.join(context.buildRoot, 'node_modules/electron/package.json'),
    gradle: path.join(context.buildRoot, 'android/gradlew'),
    java: path.join(JAVA_HOME, 'bin/java'),
  };
}

export function macosA5GradleEnv(env = process.env) {
  return { ...env, ANDROID_HOME: SDK_ROOT, ANDROID_SDK_ROOT: SDK_ROOT, JAVA_HOME };
}

export function assertSafeMacosA5Environment(paths) {
  if (process.platform !== 'darwin') throw new Error('macos-a5-dev only runs on macOS');
  for (const key of ['adb', 'cap', 'gradle', 'java']) {
    if (!existsSync(paths[key])) throw new Error(`Missing required ${key}: ${paths[key]}`);
  }
}

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
  runMacosA5CaptureReadiness(checked, paths, A5_SERIAL, APP_ID);
}

function pairingReadiness(paths) {
  runMacosA5PairingReadiness(checked, paths, A5_SERIAL, APP_ID);
}

export function build(paths, run = checked, onStage = () => {}) {
  onStage('web-build');
  run('npm', ['run', 'android:web:build'], { cwd: paths.buildRoot });
  onStage('capacitor-sync');
  run(paths.cap, ['sync', 'android'], { cwd: paths.buildRoot });
  onStage('gradle-build');
  run(paths.gradle, ['--no-daemon', 'assembleDebug', 'assembleDebugAndroidTest'], {
    cwd: path.join(paths.buildRoot, 'android'), env: macosA5GradleEnv()
  });
  onStage('apk-check');
  if (!existsSync(paths.apk)) throw new Error(`Debug APK was not produced: ${paths.apk}`);
}

function launchAndVerify(paths) {
  checked(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'start', '-n', COMPONENT]);
  checked(process.execPath, [
    path.join(paths.buildRoot, 'scripts/android/verify-android-launch.mjs'),
    '--adb', paths.adb, '--serial', A5_SERIAL, '--app-id', APP_ID,
    '--component', COMPONENT, '--timeout-seconds', '30', '--stability-seconds', '3'
  ], { cwd: paths.buildRoot });
}

async function deploy(
  paths, buildIdentity = captureIdentity, markMutationBoundary = () => {}, buildAction = build
) {
  assertFixedA5(paths);
  buildAction(paths);
  markMutationBoundary();
  const runId = buildIdentity();
  const evidenceRoot = path.join(paths.artifactsRoot, 'a5-deploy', runId);
  const snapshotRoot = path.join(paths.deviceBackupRoot, runId);
  const baselineManifest = path.join(evidenceRoot, 'baseline.json');
  mkdirSync(evidenceRoot, { recursive: true });
  checked(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'force-stop', APP_ID]);
  await protectData(paths, macosA5GradleEnv(), 'backup', baselineManifest, snapshotRoot);
  checked(paths.adb, ['-s', A5_SERIAL, 'install', '-r', paths.apk]);
  launchAndVerify(paths);
  checked(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'force-stop', APP_ID]);
  await protectData(paths, macosA5GradleEnv(), 'check', baselineManifest, snapshotRoot);
  launchAndVerify(paths);
  console.log(`[macos-a5-dev] deploy evidence=${baselineManifest}`);
}

export async function protectData(paths, env, mode, manifest, backupRoot) {
  if (!backupRoot) throw new Error('Transient Android snapshot root is required.');
  const result = await execute(process.execPath, [
    path.join(paths.buildRoot, 'scripts/android/android-device-data-protection.mjs'),
    '--mode', mode, '--adb', paths.adb, '--serial', A5_SERIAL, '--app-id', APP_ID,
    '--backup-root', backupRoot, '--manifest', manifest
  ], { env, timeoutCode: `data_${mode}_timeout`, timeoutMs: 5 * 60_000 });
  if (result.code !== 0) throw Object.assign(new Error(`Data protection ${mode} failed`), { result });
  return result;
}

async function captureAnnotation(
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
  const result = await runA5CaptureAnnotation({
    adbPort: '5037', buildIdentity: runId, env, evidenceRoot, execute, paths: {
      adbPath: paths.adb, buildRoot: paths.buildRoot
    },
    protectData: (mode, manifest, backupRoot) => protectData(paths, env, mode, manifest, backupRoot),
    serial: A5_SERIAL
  });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] capture-annotation evidence=${result.captureAnnotation.manifestPath}`);
}

export async function runMacosA5Action(action, repoRoot = process.cwd(), { formal = false } = {}) {
  const actionContract = assertRegisteredMacosA5Action(action);
  if (formal) assertFormalMacosA5Action(actionContract);
  const formalCandidate = formal && actionContract.formalSourceClass === 'frozen-build'
    ? beginFormalA5Candidate(repoRoot) : null;
  let context = createMacosA5ExecutionContext({
    acceptedRevision: formalCandidate?.revision, acceptedTree: formalCandidate?.tree,
    action, formalSourceClass: formal ? actionContract.formalSourceClass : null, repoRoot,
    requiresHiddenDesktopRuntime: formal && actionContract.requiresHiddenDesktopRuntime
  });
  openMacosA5Run(context);
  let receipt;
  try { receipt = formal ? openFormalA5Receipt(context, actionContract) : null; }
  catch (error) { closeMacosA5Run(context); throw error; }
  let lease;
  let failure;
  let failedStage;
  try {
    if (formalCandidate) context = openMacosA5BuildCapsule(context, {
      onStage: (stage) => markFormalA5Stage(receipt, `capsule-${stage}`)
    });
    const paths = macosA5Paths(context);
    assertSafeMacosA5Environment(paths);
    if (receipt) captureFormalA5Toolchain(receipt, paths, (command, args, options) =>
      spawnSync(command, args, { ...options, env: macosA5GradleEnv() }));
    if (actionContract.deviceLeaseMode) {
      lease = acquireMacosA5DeviceLease(context, actionContract.deviceLeaseMode);
    }
    if (receipt) (actionContract.mutatesFixedA5
      ? markFormalA5Stage(receipt, 'action-preflight') : markFormalA5ActionRunning(receipt));
    const buildIdentity = formal ? () => context.runId : captureIdentity;
    const runBuild = (actionPaths) => build(actionPaths, checked,
      (stage) => receipt && markFormalA5Stage(receipt, stage));
    await dispatchMacosA5Action({ action, assertFixed: assertFixedA5, build: runBuild, buildIdentity,
      captureAnnotation, captured, checked, deploy, env: macosA5GradleEnv(), execute,
      markMutationBoundary: () => receipt && markFormalA5MutationBoundary(receipt),
      pairingReadiness, paths,
      protectData: (mode, manifest, backupRoot) => protectData(
        paths, macosA5GradleEnv(), mode, manifest, backupRoot
      ), readiness, serial: A5_SERIAL });
    if (receipt) {
      markFormalA5Stage(receipt, 'action-evidence');
      prepareFormalA5ReceiptCompletion(receipt, context, paths);
    }
  } catch (error) {
    failure = error;
    failedStage = formalA5FailureStage(error, receipt?.receipt.stage);
  }
  const cleanupError = cleanupMacosA5Run({ actionFailed: Boolean(failure),
    adb: macosA5Paths(context).adb, context, deviceLeaseMode: actionContract.deviceLeaseMode,
    lease, receipt });
  if (!failure && cleanupError) { failure = cleanupError; failedStage = 'cleanup'; }
  if (failure) {
    if (receipt) failFormalA5Receipt(receipt, failure, failedStage);
    throw failure;
  }
  const completedReceipt = receipt ? completeFormalA5Receipt(receipt) : null;
  const acceptedTip = completedReceipt ? formalA5AcceptedTipLine(completedReceipt) : null;
  if (acceptedTip) process.stdout.write(acceptedTip);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runMacosA5Cli({ argv: process.argv.slice(2), errorEvidence: macosA5ErrorEvidence,
    repoRoot: process.cwd(), run: runMacosA5Action });
}
