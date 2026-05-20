/* global URL, console, process */

import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WINDOWS_CLIENT_ACTIONS = new Set(['status', 'start', 'stop', 'restart', 'full-restart']);

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const psScriptPath = path.join(repoRoot, 'scripts', 'windows', 'restart-electron-dev.ps1');
const execFileAsync = promisify(execFile);

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      shell: false,
      stdio: options.stdio ?? 'inherit'
    });
    child.on('error', (error) => {
      resolve({ code: 1, error });
    });
    child.on('exit', (code) => {
      resolve({ code: code ?? 1, error: null });
    });
  });
}

export function resolveWindowsClientAction(argv) {
  const action = argv[2] ?? process.env.WINDOWS_CLIENT_ACTION ?? 'status';
  if (!WINDOWS_CLIENT_ACTIONS.has(action)) {
    throw new Error(`unsupported Windows client action: ${action}`);
  }
  return action;
}

export function resolveWindowsWorkdir(env = process.env) {
  return env.FOLIOLE_WINDOWS_WORKDIR?.trim() || env.WINDOWS_WORKDIR?.trim() || repoRoot;
}

export async function resolveRuntimeHead(env = process.env) {
  const configured = env.FOLIOLE_RUNTIME_HEAD?.trim();
  if (configured) {
    return configured;
  }
  try {
    const result = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
    return result.stdout.trim();
  } catch {
    return '';
  }
}

export function buildPowerShellArgs({ action, runtimeHead, windowsWorkdir }) {
  return [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    psScriptPath,
    '-Action',
    action,
    '-WindowsWorkDir',
    windowsWorkdir,
    '-RuntimeHead',
    runtimeHead
  ];
}

async function main() {
  const action = resolveWindowsClientAction(process.argv);
  const windowsWorkdir = resolveWindowsWorkdir();
  const runtimeHead = await resolveRuntimeHead();
  console.log(`[windows-client-native] action=${action}`);
  console.log(`[windows-client-native] workdir=${windowsWorkdir}`);
  const result = await run('powershell.exe', buildPowerShellArgs({ action, runtimeHead, windowsWorkdir }));
  if (result.error) {
    console.error(`[windows-client-native] failed to launch powershell.exe: ${result.error.message}`);
  }
  process.exitCode = result.code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
