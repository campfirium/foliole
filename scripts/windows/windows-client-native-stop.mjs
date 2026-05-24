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

async function isRepoDevShellPid(pid, repoRoot) {
  if (process.platform !== 'win32' || !Number.isInteger(pid) || pid <= 0 || !repoRoot) {
    return false;
  }
  const scriptPath = path.join(repoRoot, 'scripts', 'windows', 'electron-dev-native.mjs');
  const scriptLiteral = scriptPath.replaceAll("'", "''");
  const result = await runCapture('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `$process = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"; ` +
      `$script = [System.IO.Path]::GetFullPath('${scriptLiteral}'); ` +
      'if ($process -and $process.CommandLine -like "*$script*") { $process.ProcessId }'
  ], {
    timeoutMs: 10000
  });
  return result.code === 0 && result.stdout.split(/\s+/u).includes(String(pid));
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
  const repoElectronPids = await listRepoElectronPids(repoRoot);
  const pids = new Set([ready?.appReady.pid]);
  for (const pid of repoElectronPids) {
    pids.add(pid);
  }
  if (await isRepoDevShellPid(state?.shellPid, repoRoot)) {
    pids.add(state.shellPid);
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
