/* global console, process */

import path from 'node:path';

import { killPid, runCapture } from './windows-client-native-process.mjs';

export async function listRepoElectronPids(repoRoot) {
  if (process.platform !== 'win32' || !repoRoot) {
    return [];
  }
  const electronPath = path.join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  const electronPathLiteral = electronPath.replaceAll("'", "''");
  const result = await runCapture('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `$target = [System.IO.Path]::GetFullPath('${electronPathLiteral}'); ` +
      'Get-Process -Name electron -ErrorAction SilentlyContinue | ' +
      'Where-Object { $_.Path -and ([System.IO.Path]::GetFullPath($_.Path) -eq $target) } | ' +
      'ForEach-Object { $_.Id }'
  ], {
    timeoutMs: 10000
  });
  if (result.code !== 0) {
    return [];
  }
  return result.stdout
    .split(/\s+/u)
    .map((value) => Number.parseInt(value, 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

export async function stopNativeClient({
  print,
  readClientState,
  readReadyState,
  removeClientState,
  repoRoot,
  resetMarkers
}) {
  const state = readClientState();
  const ready = readReadyState();
  const errors = [];
  const pids = new Set([state?.runtimePid, ready?.appReady.pid, state?.shellPid]);
  for (const pid of await listRepoElectronPids(repoRoot)) {
    pids.add(pid);
  }
  for (const pid of pids) {
    try {
      await killPid(pid);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const remainingReady = readReadyState();
  const remainingRepoPids = await listRepoElectronPids(repoRoot);
  if (remainingReady || remainingRepoPids.length > 0) {
    const remaining = remainingRepoPids.length > 0 ? `remaining electron pids=${remainingRepoPids.join(',')}` : 'runtime still running';
    throw new Error(`client stop failed: ${[...errors, remaining].filter(Boolean).join('; ')}`);
  }
  await removeClientState();
  await resetMarkers();
  if (print) {
    console.log('[windows-restart-client] status: STOPPED');
  }
}
