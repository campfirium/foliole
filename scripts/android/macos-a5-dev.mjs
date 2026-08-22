#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';
import { runMacosA5Cli } from './macos-a5-cli.mjs';
import {
  closeMacosA5Run, createMacosA5ExecutionContext, openMacosA5Run
} from './macos-a5-execution-context.mjs';
import {
  macosA5ErrorEvidence,
  recoverMacosA5SyncGroupRejoinEntry,
  runMacosA5ClearAppDataEntry,
  runMacosA5SettledStoppedStatus,
  runMacosA5DatabasePerformanceEntry,
  runMacosA5ExistingSyncEntry,
  runMacosA5PairSyncEntry,
  runMacosA5SyncGroupRejoinEntry
} from './macos-a5-extended-actions.mjs';
import {
  createMacosA5CaptureIdentity as captureIdentity,
  runMacosA5CaptureReadiness,
  runMacosA5PairingReadiness
} from './macos-a5-readiness.mjs';
import {
  beginFormalA5Candidate, finishFormalA5Candidate
} from './macos-a5-formal-candidate.mjs';
import { checked, captured, execute } from './macos-a5-process.mjs';
import {
  acquireMacosA5DeviceLease, releaseMacosA5DeviceLease
} from './macos-a5-run-lease.mjs';

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

export function build(paths) {
  checked('npm', ['run', 'android:web:build'], { cwd: paths.buildRoot });
  checked(paths.cap, ['sync', 'android'], { cwd: paths.buildRoot });
  checked(paths.gradle, ['--no-daemon', 'assembleDebug', 'assembleDebugAndroidTest'], {
    cwd: path.join(paths.buildRoot, 'android'), env: macosA5GradleEnv()
  });
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

async function deploy(paths) {
  assertFixedA5(paths);
  build(paths);
  const runId = captureIdentity();
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

async function captureAnnotation(paths) {
  assertFixedA5(paths);
  readiness(paths);
  build(paths);
  const buildIdentity = captureIdentity();
  const evidenceRoot = path.join(paths.artifactsRoot, 'a5-capture-annotation', buildIdentity);
  const env = macosA5GradleEnv();
  const { runA5CaptureAnnotation } = await import('./android-a5-capture-annotation-action.mjs');
  const result = await runA5CaptureAnnotation({
    adbPort: '5037', buildIdentity, env, evidenceRoot, execute, paths: {
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
  const context = createMacosA5ExecutionContext({ action, repoRoot });
  const paths = macosA5Paths(context);
  const formalCandidate = formal ? beginFormalA5Candidate(context.sourceRepoRoot) : null;
  openMacosA5Run(context);
  let lease;
  try {
    assertSafeMacosA5Environment(paths);
    if (actionContract.deviceLeaseMode) {
      lease = acquireMacosA5DeviceLease(context, actionContract.deviceLeaseMode);
    }
    if (action === 'build') build(paths);
    if (action === 'status') {
      assertFixedA5(paths);
      pairingReadiness(paths);
      readiness(paths);
    }
    if (action === 'sync-group-stopped-status') {
      await runMacosA5SettledStoppedStatus({ assertFixed: () => assertFixedA5(paths), checked,
        env: macosA5GradleEnv(), pairingReadiness, paths, readiness, serial: A5_SERIAL });
    }
    if (action === 'deploy') await deploy(paths);
    if (action === 'capture-annotation') await captureAnnotation(paths);
    if (action === 'database-performance') await runMacosA5DatabasePerformanceEntry({
      assertFixed: () => assertFixedA5(paths), build: () => build(paths), env: macosA5GradleEnv(), execute, paths, serial: A5_SERIAL });
    if (action === 'device-profile') {
      const { runMacosA5DeviceProfileEntry } = await import('./macos-a5-device-profile-action.mjs');
      await runMacosA5DeviceProfileEntry({
        assertFixed: () => assertFixedA5(paths), build: () => build(paths), buildIdentity: captureIdentity,
        captured, checked, paths,
        protectData: (mode, manifest, backupRoot) => protectData(paths, macosA5GradleEnv(), mode, manifest, backupRoot),
        serial: A5_SERIAL
      });
    }
    const productArgs = {
      assertFixed: () => assertFixedA5(paths), build: () => build(paths), buildIdentity: captureIdentity,
      checked, env: macosA5GradleEnv(), execute, paths,
      protectData: (mode, manifest, backupRoot) => protectData(
        paths, macosA5GradleEnv(), mode, manifest, backupRoot
      ), serial: A5_SERIAL
    };
    if (action === 'pair-sync') await runMacosA5PairSyncEntry(productArgs);
    if (action === 'pair-credentials') await (await import('./macos-a5-pair-credentials-action.mjs')).runMacosA5PairCredentialsEntry(productArgs);
    if (action === 'leave-sync-group') await (await import('./macos-a5-leave-sync-group-entry.mjs')).runMacosA5LeaveSyncGroupEntry(productArgs);
    if (action === 'clear-app-data') await runMacosA5ClearAppDataEntry(productArgs);
    if (action === 'sync-existing') await runMacosA5ExistingSyncEntry(productArgs);
    if (action === 'sync-group-rejoin') await runMacosA5SyncGroupRejoinEntry(productArgs);
    if (action === 'sync-group-rejoin-recover') {
      await recoverMacosA5SyncGroupRejoinEntry(productArgs);
    }
  } finally {
    if (actionContract.deviceLeaseMode) spawnSync(paths.adb, ['kill-server']);
    try {
      if (lease) releaseMacosA5DeviceLease(lease);
    } finally {
      closeMacosA5Run(context);
    }
  }
  const acceptedTip = finishFormalA5Candidate(formalCandidate, context.sourceRepoRoot);
  if (acceptedTip) console.log(`[macos-a5-dev] accepted-tip=${acceptedTip}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runMacosA5Cli({ argv: process.argv.slice(2), errorEvidence: macosA5ErrorEvidence,
    repoRoot: process.cwd(), run: runMacosA5Action });
}
