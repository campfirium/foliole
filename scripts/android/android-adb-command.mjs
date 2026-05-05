/* global process */

import { Buffer } from 'node:buffer';
import { execFile, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function adbCandidates(adbPath) {
  if (adbPath !== 'adb') return [adbPath];
  const candidates = ['adb', 'adb.exe'];
  for (const sdkRoot of [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME]) {
    if (sdkRoot) candidates.push(path.join(sdkRoot, 'platform-tools', 'adb'));
  }
  candidates.push(path.join('/mnt/c/Users', os.userInfo().username, 'AppData/Local/Android/Sdk/platform-tools/adb.exe'));
  return [...new Set(candidates)];
}

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
  if (options.serial) return options.serial;
  const { stdout } = await runAdb({ ...options, serial: '' }, ['devices'], { encoding: 'utf8' });
  const line = stdout.split(/\r?\n/).find((entry) => /\bdevice$/.test(entry.trim()));
  if (!line) throw new Error('No ready Android emulator/device found.');
  return line.trim().split(/\s+/)[0];
}
