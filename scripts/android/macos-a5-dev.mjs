#!/usr/bin/env node
/* global console, process */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { pathToFileURL } from 'node:url';

import {
  runMacosA5DatabasePerformanceEntry,
  runMacosA5ExistingSyncEntry,
  runMacosA5PairSyncEntry
} from './macos-a5-extended-actions.mjs';
import {
  createMacosA5CaptureIdentity as captureIdentity,
  runMacosA5CaptureReadiness,
  runMacosA5PairingReadiness
} from './macos-a5-readiness.mjs';

export const A5_SERIAL = '87a33a4b';
const APP_ID = 'com.foliole.android';
const COMPONENT = `${APP_ID}/.MainActivity`;
const SDK_ROOT = '/opt/homebrew/share/android-commandlinetools';
const JAVA_HOME = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';

function checked(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed with exit ${result.status}`);
}

function captured(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `${path.basename(command)} failed`);
  return result.stdout.trim();
}

function execute(command, args, { timeoutCode = 'command_timeout', timeoutMs, ...options }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let stderr = '';
    let stdout = '';
    const collect = (key) => (chunk) => {
      output += chunk;
      if (key === 'stdout') stdout += chunk;
      else stderr += chunk;
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(Object.assign(new Error(`${path.basename(command)} timed out`), { code: timeoutCode }));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, lines: output.split(/\r?\n/u).filter(Boolean), output, stderr, stdout });
    });
  });
}

export function macosA5Paths(repoRoot = process.cwd()) {
  return {
    adb: path.join(SDK_ROOT, 'platform-tools', 'adb'),
    apk: path.join(repoRoot, 'android/app/build/outputs/apk/debug/app-debug.apk'),
    cap: path.join(repoRoot, 'node_modules/.bin/cap'),
    gradle: path.join(repoRoot, 'android/gradlew'),
    java: path.join(JAVA_HOME, 'bin/java'),
    repoRoot
  };
}

export function macosA5GradleEnv(env = process.env) {
  return { ...env, ANDROID_HOME: SDK_ROOT, ANDROID_SDK_ROOT: SDK_ROOT, JAVA_HOME };
}

export function macosA5ErrorEvidence(error) {
  const output = error?.result?.output;
  return typeof output === 'string' && output ? output : '';
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
  checked('npm', ['run', 'android:web:build'], { cwd: paths.repoRoot });
  checked(paths.cap, ['sync', 'android'], { cwd: paths.repoRoot });
  checked(paths.gradle, ['--no-daemon', 'assembleDebug', 'assembleDebugAndroidTest'], {
    cwd: path.join(paths.repoRoot, 'android'), env: macosA5GradleEnv()
  });
  if (!existsSync(paths.apk)) throw new Error(`Debug APK was not produced: ${paths.apk}`);
}

function deploy(paths) {
  assertFixedA5(paths);
  readiness(paths);
  build(paths);
  checked(paths.adb, ['-s', A5_SERIAL, 'install', '-r', paths.apk]);
  checked(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'force-stop', APP_ID]);
  checked(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'start', '-n', COMPONENT]);
  checked(process.execPath, [
    path.join(paths.repoRoot, 'scripts/android/verify-android-launch.mjs'),
    '--adb', paths.adb, '--serial', A5_SERIAL, '--app-id', APP_ID,
    '--component', COMPONENT, '--timeout-seconds', '30', '--stability-seconds', '3'
  ], { cwd: paths.repoRoot });
  readiness(paths);
}

export async function protectData(paths, env, mode, manifest, backupRoot) {
  if (!backupRoot) throw new Error('Transient Android snapshot root is required.');
  const result = await execute(process.execPath, [
    path.join(paths.repoRoot, 'scripts/android/android-device-data-protection.mjs'),
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
  const evidenceRoot = path.join(paths.repoRoot, '.tmp/artifacts/a5-capture-annotation', buildIdentity);
  const env = macosA5GradleEnv();
  const { runA5CaptureAnnotation } = await import('./android-a5-capture-annotation-action.mjs');
  const result = await runA5CaptureAnnotation({
    adbPort: '5037', buildIdentity, env, evidenceRoot, execute, paths: {
      adbPath: paths.adb, repoRoot: paths.repoRoot
    },
    protectData: (mode, manifest, backupRoot) => protectData(paths, env, mode, manifest, backupRoot),
    serial: A5_SERIAL
  });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] capture-annotation evidence=${result.captureAnnotation.manifestPath}`);
}

export async function runMacosA5Action(action, repoRoot = process.cwd()) {
  if (!['status', 'build', 'capture-annotation', 'database-performance', 'deploy',
    'device-profile', 'pair-sync', 'sync-existing'].includes(action)) {
    throw new Error('Usage: node scripts/android/macos-a5-dev.mjs <registered-action>');
  }
  const paths = macosA5Paths(repoRoot);
  assertSafeMacosA5Environment(paths);
  try {
    if (action === 'build') build(paths);
    if (action === 'status') {
      assertFixedA5(paths);
      pairingReadiness(paths);
      readiness(paths);
    }
    if (action === 'deploy') deploy(paths);
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
      checked, env: macosA5GradleEnv(), execute, paths, serial: A5_SERIAL
    };
    if (action === 'pair-sync') await runMacosA5PairSyncEntry(productArgs);
    if (action === 'sync-existing') await runMacosA5ExistingSyncEntry(productArgs);
  } finally {
    spawnSync(paths.adb, ['kill-server']);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runMacosA5Action(process.argv[2]);
  } catch (error) {
    const evidence = macosA5ErrorEvidence(error);
    if (evidence) process.stderr.write(evidence.endsWith('\n') ? evidence : `${evidence}\n`);
    console.error(`[macos-a5-dev] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
