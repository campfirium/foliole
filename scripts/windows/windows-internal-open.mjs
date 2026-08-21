#!/usr/bin/env node
/* global console, process, setTimeout */

import { Buffer } from 'node:buffer';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { dispatchWindowsNativeClientAction } from './windows-client-native-interactive.mjs';
import { resolveWindowsNativePaths } from './windows-native-paths.mjs';

const ACTION = 'internal-open';
const SUCCESS_STAGES = ['database_schema_init_complete', 'window_visible', 'app_ready'];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encodePowerShell(command) {
  return Buffer.from(command, 'utf16le').toString('base64');
}

function installedPaths(env = process.env) {
  const executable = path.join(env.LOCALAPPDATA, 'Programs', 'Foliole Internal', 'Foliole Internal.exe');
  const userData = path.join(env.APPDATA, 'foliole-internal');
  return { executable, log: path.join(userData, 'logs', 'windows', 'native-boot-events.ndjson') };
}

function stopInstalledRuntime(executable) {
  const escaped = executable.replaceAll("'", "''");
  const command = `$target = [IO.Path]::GetFullPath('${escaped}'); `
    + `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and `
    + `[IO.Path]::GetFullPath($_.ExecutablePath) -eq $target } | `
    + `ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(command)
  ], { encoding: 'utf8', timeout: 15_000, windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'failed to stop installed Internal runtime');
}

function sessionEvents(logPath, session) {
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf8').split(/\r?\n/u).filter(Boolean).flatMap((line) => {
    try {
      const event = JSON.parse(line);
      return event.session === session ? [event] : [];
    } catch { return []; }
  });
}

async function waitForReady(logPath, session, timeoutMs = 70_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const events = sessionEvents(logPath, session);
    const failure = events.find((event) => event.stage === 'startup_runtime_services_failed');
    if (failure) throw new Error(`installed Internal startup failed: ${failure.payload?.message ?? 'unknown'}`);
    const stages = new Set(events.map((event) => event.stage));
    if (SUCCESS_STAGES.every((stage) => stages.has(stage))) return events;
    await wait(500);
  }
  throw new Error(`installed Internal startup timed out session=${session}`);
}

async function runInteractiveOpen() {
  const { executable, log } = installedPaths();
  if (!fs.existsSync(executable)) throw new Error(`installed Internal executable is missing: ${executable}`);
  stopInstalledRuntime(executable);
  await wait(1_000);
  const session = `windows-internal-${Date.now()}`;
  const child = spawn(executable, [], {
    cwd: path.dirname(executable), detached: true,
    env: { ...process.env, FOLIOLE_BOOT_SESSION: session }, stdio: 'ignore', windowsHide: false
  });
  child.unref();
  const events = await waitForReady(log, session);
  const visible = events.findLast((event) => event.stage === 'window_visible');
  console.log(`[windows-internal-open] status=READY session=${session} pid=${visible?.pid ?? child.pid}`);
  console.log('[windows-internal-open] library=D:\\X\\U\\Foliole schema=76 window=visible app=ready');
}

async function main() {
  const native = resolveWindowsNativePaths();
  if (await dispatchWindowsNativeClientAction({
    action: ACTION, installScript: native.nativeTaskInstallScript, repoRoot: native.repoRoot,
    stateRoot: native.nativeTaskStateRoot, workerScript: native.nativeTaskWorkerScript
  })) return;
  await runInteractiveOpen();
}

main().catch((error) => {
  console.error(`[windows-internal-open] status=FAILED reason=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
