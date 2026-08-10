#!/usr/bin/env node
/* global console, process */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { pathToFileURL } from 'node:url';

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
    protectionBackups: path.join(repoRoot, '.lab/internal/android-device-backups/mac-a5'),
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
  checked(process.execPath, [
    path.join(paths.repoRoot, 'scripts/android/android-capture-annotation-readiness-runner.mjs'),
    '--adb', paths.adb, '--serial', A5_SERIAL, '--app-id', APP_ID
  ], { cwd: paths.repoRoot });
}

function pairingReadiness(paths) {
  checked(process.execPath, [
    path.join(paths.repoRoot, 'scripts/android/android-pair-sync-recovery-readiness-runner.mjs'),
    '--adb', paths.adb, '--serial', A5_SERIAL, '--app-id', APP_ID
  ], { cwd: paths.repoRoot });
}

export function build(paths) {
  checked('npm', ['run', 'android:web:build'], { cwd: paths.repoRoot });
  checked(paths.cap, ['sync', 'android'], { cwd: paths.repoRoot });
  checked(paths.gradle, ['--no-daemon', 'assembleDebug', 'assembleDebugAndroidTest'], {
    cwd: path.join(paths.repoRoot, 'android'), env: macosA5GradleEnv()
  });
  if (!existsSync(paths.apk)) throw new Error(`Debug APK was not produced: ${paths.apk}`);
}

function buildDesktop(paths) {
  checked('npm', ['run', 'build'], { cwd: paths.repoRoot });
  checked('npm', ['run', 'electron:compile'], { cwd: paths.repoRoot });
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

export async function protectData(paths, env, mode, manifest, backupRoot = paths.protectionBackups) {
  const result = await execute(process.execPath, [
    path.join(paths.repoRoot, 'scripts/android/android-device-data-protection.mjs'),
    '--mode', mode, '--adb', paths.adb, '--serial', A5_SERIAL, '--app-id', APP_ID,
    '--backup-root', backupRoot, '--manifest', manifest
  ], { env, timeoutCode: `data_${mode}_timeout`, timeoutMs: 5 * 60_000 });
  if (result.code !== 0) throw Object.assign(new Error(`Data protection ${mode} failed`), { result });
  return result;
}

function captureIdentity() {
  const timestamp = new Date().toISOString().replace(/\D/gu, '').slice(0, 17);
  return `${timestamp}-mac-a5`;
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
      adbPath: paths.adb, protectionBackups: paths.protectionBackups, repoRoot: paths.repoRoot
    },
    protectData: (mode, manifest, backupRoot) => protectData(paths, env, mode, manifest, backupRoot),
    serial: A5_SERIAL
  });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] capture-annotation evidence=${result.captureAnnotation.manifestPath}`);
}

async function pairSync(paths) {
  assertFixedA5(paths);
  const { resolveMacosA5PairSyncReadiness } = await import('./macos-a5-product-bootstrap.mjs');
  const readinessState = resolveMacosA5PairSyncReadiness(paths);
  build(paths);
  buildDesktop(paths);
  const buildIdentity = captureIdentity();
  const evidenceRoot = path.join(paths.repoRoot, '.tmp/artifacts/a5-pair-sync', buildIdentity);
  const env = macosA5GradleEnv();
  const { runMacosA5PairSync } = await import('./macos-a5-pair-sync-action.mjs');
  const result = await runMacosA5PairSync({
    buildIdentity,
    credentialRepairRequired: readinessState.credentialRepairRequired,
    deviceFingerprint: readinessState.deviceIdentityFingerprint,
    existingPairing: readinessState.existingPairing,
    remotePeerFingerprint: readinessState.remotePeerFingerprint,
    env,
    evidenceRoot,
    execute,
    paths,
    protectData: (mode, manifest, backupRoot) => protectData(
      paths, env, mode, manifest, backupRoot
    ),
    serial: A5_SERIAL
  });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] pair-sync evidence=${result.pairSyncRecovery.manifestPath}`);
}

async function databasePerformance(paths) {
  assertFixedA5(paths); build(paths);
  const { runA5DatabasePerformance } = await import('./android-a5-database-performance-action.mjs');
  const result = await runA5DatabasePerformance({ env: macosA5GradleEnv(),
    evidenceRoot: path.join(paths.repoRoot, '.tmp/artifacts/companion-database-performance'),
    execute, paths, serial: A5_SERIAL });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] database-performance evidence=${result.evidencePath}`);
}

export async function runMacosA5Action(action, repoRoot = process.cwd()) {
  if (!['status', 'build', 'capture-annotation', 'database-performance', 'deploy', 'pair-sync'].includes(action)) {
    throw new Error('Usage: node scripts/android/macos-a5-dev.mjs <status|build|capture-annotation|database-performance|deploy|pair-sync>');
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
    if (action === 'database-performance') await databasePerformance(paths);
    if (action === 'pair-sync') await pairSync(paths);
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
