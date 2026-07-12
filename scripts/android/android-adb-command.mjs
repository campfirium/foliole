/* global process */

import { Buffer } from 'node:buffer';
import { execFile, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function adbCandidates(adbPath) {
  if (adbPath !== 'adb') return [adbPath];
  const candidates = [process.env.ADB_PATH, 'adb', 'adb.exe'];
  for (const sdkRoot of [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME]) {
    if (sdkRoot) candidates.push(path.join(sdkRoot, 'platform-tools', 'adb'));
  }
  if (process.env.USERPROFILE) {
    candidates.push(path.join(process.env.USERPROFILE, 'AppData/Local/Android/Sdk/platform-tools/adb.exe'));
  }
  candidates.push(path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb'));
  candidates.push(path.posix.join('/mnt/c/Users', os.userInfo().username, 'AppData/Local/Android/Sdk/platform-tools/adb.exe'));
  return [...new Set(candidates.filter(Boolean))];
}

export { adbCandidates };

export async function runAdb(options, args, execOptions = {}) {
  const adbArgs = options.serial ? ['-s', options.serial, ...args] : args;
  let lastError = null;
  for (const adbPath of adbCandidates(options.adb)) {
    try {
      return await execFileAsync(adbPath, adbArgs, { maxBuffer: 1024 * 1024 * 80, ...execOptions });
    } catch (error) {
      lastError = error;
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw lastError;
}

export async function spawnAdb(options, args, input) {
  const adbArgs = options.serial ? ['-s', options.serial, ...args] : args;
  let lastError = null;
  for (const adbPath of adbCandidates(options.adb)) {
    try {
      await spawnWithInput(adbPath, adbArgs, input);
      return;
    } catch (error) {
      lastError = error;
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw lastError;
}

function spawnWithInput(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stderr = [];
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}: ${Buffer.concat(stderr).toString('utf8')}`));
    });
    child.stdin.end(input);
  });
}

export async function resolveSerial(options) {
  const { stdout } = await runAdb({ ...options, serial: '' }, ['devices'], { encoding: 'utf8' });
  return selectReadySerial(stdout, options.serial);
}

export function selectReadySerial(output, requestedSerial = '') {
  const devices = output.split(/\r?\n/u)
    .map((line) => line.trim().split(/\s+/u))
    .filter(([serial, state]) => serial && state && serial !== 'List')
    .map(([serial, state]) => ({ serial, state }));
  if (requestedSerial) {
    const selected = devices.find(({ serial }) => serial === requestedSerial);
    if (!selected) throw new Error(`Android device ${requestedSerial} was not found.`);
    if (selected.state !== 'device') throw new Error(`Android device ${requestedSerial} is ${selected.state}, not ready.`);
    return requestedSerial;
  }
  const ready = devices.filter(({ state }) => state === 'device');
  if (ready.length === 0) throw new Error('No ready Android emulator/device found. Connect and authorize exactly one device.');
  if (ready.length > 1) throw new Error('Multiple ready Android devices found. Set FOLIOLE_ANDROID_SERIAL or ANDROID_SERIAL.');
  return ready[0].serial;
}
