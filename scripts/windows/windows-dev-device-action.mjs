/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { runWindowsA5LiveReload } from './windows-a5-live-reload-action.mjs';

export const WINDOWS_DEV_ADB_PORT = '5037';
export const WINDOWS_DEV_A5_SERIAL = '87a33a4b';
const APP_ID = 'com.foliole.android';
const COMPONENT = `${APP_ID}/com.foliole.android.MainActivity`;

async function runDefaultCaptureAnnotation(options) {
  const { runWindowsA5CaptureAnnotation } = await import('./windows-a5-capture-annotation-action.mjs');
  return runWindowsA5CaptureAnnotation(options);
}

function failure(message, exitCode, stage, result) {
  return Object.assign(new Error(message), { exitCode, result, stage });
}

async function checked(execute, command, args, options, stage, exitCode = 74) {
  let result;
  try { result = await execute(command, args, options); }
  catch (error) {
    throw failure(error.message, String(error.code || '').includes('timeout') ? 124 : 125, stage, error);
  }
  if (result.code !== 0) {
    const detail = result.lines?.at(-1) || result.stderr || `${command} exited ${result.code}`;
    throw failure(String(detail).trim(), exitCode, stage, result);
  }
  return result;
}

export function assertFixedDevice(output) {
  const row = String(output || '').split(/\r?\n/u).map((line) => line.trim().split(/\s+/u))
    .find(([serial]) => serial === WINDOWS_DEV_A5_SERIAL);
  if (!row) throw failure(`Fixed Android device ${WINDOWS_DEV_A5_SERIAL} is absent`, 69, 'device');
  const state = row[1];
  if (state !== 'device') throw failure(`Fixed Android device ${WINDOWS_DEV_A5_SERIAL} is ${state}`, 69, 'device');
}

function actionEnv(paths) {
  return { ...process.env, ANDROID_HOME: paths.androidSdk, ANDROID_SDK_ROOT: paths.androidSdk,
    JAVA_HOME: paths.javaHome,
    Path: `${path.win32.dirname(paths.systemNode)};${process.env.Path || process.env.PATH || ''}` };
}

function helperEnv(env) {
  return { ...env, ANDROID_ADB_SERVER_PORT: WINDOWS_DEV_ADB_PORT,
    FOLIOLE_ANDROID_ADB_SERVER_PORT: WINDOWS_DEV_ADB_PORT };
}

async function runDataProtection(execute, paths, mode, manifest, env, backupRoot = paths.protectionBackups) {
  const script = path.join(paths.repoRoot, 'scripts', 'android', 'android-device-data-protection.mjs');
  return checked(execute, paths.systemNode, [script, '--mode', mode, '--adb', paths.adbPath,
    '--serial', WINDOWS_DEV_A5_SERIAL, '--app-id', APP_ID,
    '--backup-root', backupRoot, '--manifest', manifest],
  { env: helperEnv(env), timeoutCode: `data_${mode}_timeout`, timeoutMs: 5 * 60_000,
    windowsHide: true }, `data-${mode}`);
}

async function deploy(execute, paths, evidenceRoot, env) {
  fs.mkdirSync(paths.protectionBackups, { recursive: true });
  const manifest = path.join(evidenceRoot, 'data-protection.json');
  await checked(execute, paths.adbPath, ['-P', WINDOWS_DEV_ADB_PORT,
    '-s', WINDOWS_DEV_A5_SERIAL, 'shell', 'am', 'force-stop', APP_ID],
  { env, timeoutCode: 'data_quiesce_timeout', timeoutMs: 30_000, windowsHide: true }, 'data-quiesce');
  const before = await runDataProtection(execute, paths, 'backup', manifest, env);
  const script = path.join(paths.repoRoot, 'scripts', 'android', 'windows-deploy-app.ps1');
  const action = await checked(execute, 'powershell.exe', ['-NoProfile', '-NonInteractive',
    '-ExecutionPolicy', 'Bypass', '-File', script, '-WindowsWorkDir', paths.repoRoot,
    '-TargetSerial', WINDOWS_DEV_A5_SERIAL, '-NodeExe', paths.systemNode, '-StopGradleDaemon'],
  { env: { ...helperEnv(env), ANDROID_USER_HOME: paths.signingHome }, timeoutCode: 'deploy_timeout',
    timeoutMs: 20 * 60_000, windowsHide: true }, 'deploy');
  const after = await runDataProtection(execute, paths, 'check', manifest, env);
  return `${before.output}${action.output}${after.output}`;
}

async function verify(execute, paths, env) {
  const script = path.join(paths.repoRoot, 'scripts', 'android', 'verify-android-launch.mjs');
  const result = await checked(execute, paths.systemNode, [script, '--adb', paths.adbPath,
    '--adb-server-port', WINDOWS_DEV_ADB_PORT, '--serial', WINDOWS_DEV_A5_SERIAL,
    '--app-id', APP_ID, '--component', COMPONENT, '--timeout-seconds', '20',
    '--stability-seconds', '4'],
  { env, timeoutCode: 'verify_timeout', timeoutMs: 5 * 60_000, windowsHide: true }, 'verify');
  return result.output;
}

export async function runWindowsDevDeviceAction({
  action, buildIdentity, evidenceRoot, execute, paths,
  runCaptureAnnotation = runDefaultCaptureAnnotation, runLiveReload = runWindowsA5LiveReload
}) {
  const env = actionEnv(paths);
  let started = false;
  let primaryError = null;
  let actionResult = { output: '' };
  try {
    await checked(execute, paths.adbPath, ['-P', WINDOWS_DEV_ADB_PORT, 'start-server'],
      { env, timeoutCode: 'adb_start_timeout', timeoutMs: 30_000, windowsHide: true }, 'adb-start');
    started = true;
    await checked(execute, paths.adbPath,
      ['-P', WINDOWS_DEV_ADB_PORT, '-s', WINDOWS_DEV_A5_SERIAL, 'wait-for-device'],
      { env, timeoutCode: 'device_timeout', timeoutMs: 45_000, windowsHide: true }, 'device', 69);
    const devices = await checked(execute, paths.adbPath,
      ['-P', WINDOWS_DEV_ADB_PORT, 'devices', '-l'],
      { env, timeoutCode: 'device_timeout', timeoutMs: 30_000, windowsHide: true }, 'device', 69);
    assertFixedDevice(devices.stdout);
    const state = await checked(execute, paths.adbPath,
      ['-P', WINDOWS_DEV_ADB_PORT, '-s', WINDOWS_DEV_A5_SERIAL, 'get-state'],
      { env, timeoutCode: 'device_timeout', timeoutMs: 30_000, windowsHide: true }, 'device', 69);
    if (state.stdout.trim() !== 'device') throw failure('Fixed Android device is not ready', 69, 'device');
    if (action === 'capture-annotation') {
      actionResult = await runCaptureAnnotation({
        adbPort: WINDOWS_DEV_ADB_PORT, buildIdentity, env, evidenceRoot, execute, paths,
        protectData: (mode, manifest, backupRoot) => runDataProtection(
          execute, paths, mode, manifest, env, backupRoot
        ), serial: WINDOWS_DEV_A5_SERIAL
      });
    } else if (action === 'verify') {
      actionResult = { output: await verify(execute, paths, env) };
    } else {
      const deployOutput = action === 'deploy'
        ? await deploy(execute, paths, evidenceRoot, env)
        : '';
      const live = await runLiveReload({
        adbPort: WINDOWS_DEV_ADB_PORT, buildIdentity, env, evidenceRoot, execute, paths,
        serial: WINDOWS_DEV_A5_SERIAL,
        surface: action === 'appearance' ? 'appearance' : action === 'secondary' ? 'secondary' : 'current',
        verifyForeground: () => verify(execute, paths, env)
      });
      actionResult = { ...live, output: `${deployOutput}${live.output}` };
    }
  } catch (error) { primaryError = error; }
  if (started) {
    try {
      await checked(execute, paths.adbPath, ['-P', WINDOWS_DEV_ADB_PORT, 'kill-server'],
        { env, timeoutCode: 'adb_cleanup_timeout', timeoutMs: 30_000, windowsHide: true }, 'adb-cleanup', 125);
    } catch (error) { throw failure(error.message, 125, 'adb-cleanup', error.result); }
  }
  if (primaryError) throw primaryError;
  return actionResult;
}
