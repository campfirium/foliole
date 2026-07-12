/* global console, process */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { runInherited } from './android-host-process.mjs';

const WINDOWS_INVOCATIONS = {
  control: ['powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/android/windows-control-device.ps1']],
  emulator: ['bash', ['scripts/android/windows-run-emulator.sh']],
  gradle: ['bash', ['scripts/android/windows-gradle-check.sh']],
  logcat: ['bash', ['scripts/android/windows-logcat.sh']],
  open: ['bash', ['scripts/android/windows-open.sh']],
  preview: ['bash', ['scripts/android/android-preview.sh']],
  'preview-lite': ['bash', ['scripts/android/android-preview-lite.sh']],
  screenshot: ['bash', ['scripts/android/windows-screenshot.sh']],
  sync: ['bash', ['scripts/android/windows-cap-sync.sh']]
};

export function resolveAndroidHostInvocation(command, args, options = {}) {
  const platform = options.platform ?? process.platform;
  const nodeBin = options.nodeBin ?? process.execPath;
  if (platform === 'darwin') {
    return {
      args: ['scripts/macos/android/android-host.mjs', command, ...args],
      bin: nodeBin
    };
  }
  const invocation = WINDOWS_INVOCATIONS[command];
  if (!invocation) return null;
  return { args: [...invocation[1], ...args], bin: invocation[0] };
}

export async function runAndroidHost(command, args, options = {}) {
  const invocation = resolveAndroidHostInvocation(command, args, options);
  if (!invocation) {
    console.error(`[android-host] unsupported command: ${command || '<missing>'}`);
    return 2;
  }
  return runInherited(invocation.bin, invocation.args, options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command = '', ...args] = process.argv.slice(2);
  process.exitCode = await runAndroidHost(command, args);
}
