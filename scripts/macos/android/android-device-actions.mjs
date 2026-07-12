/* global console, process, setTimeout */

import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { resolveSerial, runAdb } from '../../android/android-adb-command.mjs';
import { spawnDetached } from '../../android/android-host-process.mjs';
import { requireTool, resolveAndroidTool, resolveScrcpy } from './android-tools.mjs';

const execFileAsync = promisify(execFile);

function androidOptions(env = process.env) {
  return {
    adb: requireTool(resolveAndroidTool('adb', { env }), 'adb not found. Install Android platform-tools or set ADB_PATH/ANDROID_HOME.'),
    serial: env.FOLIOLE_ANDROID_SERIAL ?? env.ANDROID_SERIAL ?? ''
  };
}

async function selectedDevice(env) {
  const options = androidOptions(env);
  return { ...options, serial: await resolveSerial(options) };
}

function streamProcess(bin, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { ...options, shell: false, stdio: 'inherit' });
    child.on('error', () => resolve(1));
    child.on('close', (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
}

export async function runLogcat(args, env = process.env) {
  const device = await selectedDevice(env);
  const packageName = args[0] ?? env.FOLIOLE_ANDROID_PACKAGE ?? '';
  const logcatArgs = ['-s', device.serial, 'logcat'];
  if (packageName) {
    const { stdout } = await runAdb(device, ['shell', 'pidof', packageName], { encoding: 'utf8' });
    const pid = stdout.trim().split(/\s+/u)[0];
    if (pid) logcatArgs.push(`--pid=${pid}`);
  }
  console.log(`[android-logcat] device: ${device.serial}`);
  return streamProcess(device.adb, logcatArgs);
}

export async function runScreenshot(args, env = process.env) {
  const device = await selectedDevice(env);
  const outputDir = path.resolve(args[0] ?? env.ANDROID_SCREENSHOT_DIR ?? '.tmp/android-screenshots');
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `android-${new Date().toISOString().replace(/[:.]/gu, '-')}.png`);
  const { stdout } = await runAdb(device, ['exec-out', 'screencap', '-p'], { encoding: null });
  await writeFile(outputPath, stdout);
  console.log(`[android-screenshot] device: ${device.serial}`);
  console.log(`[android-screenshot] output: ${outputPath}`);
  return 0;
}

export function markerPath(serial, env) {
  const root = path.resolve(env.FOLIOLE_ANDROID_RUNTIME_DIR ?? '.tmp/android-runtime');
  return path.join(root, `scrcpy-${serial.replace(/[^a-zA-Z0-9._-]/gu, '_')}.json`);
}

async function markerProcess(marker, scrcpy, serial) {
  if (!Number.isInteger(marker?.pid) || marker.pid <= 0) return false;
  try {
    process.kill(marker.pid, 0);
    const { stdout } = await execFileAsync('/bin/ps', ['-p', String(marker.pid), '-o', 'command='], { encoding: 'utf8' });
    return stdout.includes(scrcpy) && stdout.includes('Foliole-Android') && stdout.includes(serial);
  } catch {
    return false;
  }
}

async function reuseMarker(filePath, scrcpy, serial) {
  try {
    const marker = JSON.parse(await readFile(filePath, 'utf8'));
    if (await markerProcess(marker, scrcpy, serial)) return true;
  } catch {
    // Missing or invalid markers are stale process state.
  }
  await rm(filePath, { force: true });
  return false;
}

export async function runControl(args, env = process.env) {
  const device = await selectedDevice(env);
  const scrcpy = requireTool(resolveScrcpy({ env }), 'scrcpy not found. Install it or set SCRCPY_PATH.');
  const filePath = markerPath(device.serial, env);
  await mkdir(path.dirname(filePath), { recursive: true });
  if (await reuseMarker(filePath, scrcpy, device.serial)) {
    console.log('[android-control] mirror: reused');
    console.log('[android-control] status: OPENED');
    return 0;
  }
  const scrcpyArgs = [`--serial=${device.serial}`, '--stay-awake', '--no-audio', '--window-title=Foliole-Android', ...args];
  const child = spawnDetached(scrcpy, scrcpyArgs);
  await writeFile(filePath, JSON.stringify({ pid: child.pid, serial: device.serial, startedAt: new Date().toISOString() }), 'utf8');
  await new Promise((resolve) => setTimeout(resolve, 750));
  if (!await markerProcess({ pid: child.pid }, scrcpy, device.serial)) throw new Error('scrcpy exited before the mirror became ready.');
  for (const command of [['shell', 'svc', 'power', 'stayon', 'true'], ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']]) {
    try { await runAdb(device, command); } catch { console.warn(`[android-control] warning: adb ${command.slice(1).join(' ')} failed`); }
  }
  console.log(`[android-control] device: ${device.serial}`);
  console.log('[android-control] status: OPENED');
  return 0;
}
