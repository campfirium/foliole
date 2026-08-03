import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { SpawnedCodexProcess } from './codexAppServerSessionTypes.js';

export const CODEX_APP_SERVER_ARGS = [
  'app-server',
  '--disable', 'code_mode',
  '--disable', 'shell_tool',
  '--disable', 'unified_exec'
];

const HASH_DIRECTORY_PATTERN = /^[a-f0-9]{16}$/i;
const PROBE_TIMEOUT_MS = 2_000;
const APP_SERVER_PROBE_TIMEOUT_MS = 5_000;

export interface CodexLauncherOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export type CodexCommandProbeResult = 'incompatible' | 'missing' | 'ready';

export async function findCodexCommandCandidates(
  env: NodeJS.ProcessEnv,
  platform = process.platform
) {
  const configuredCommand = env.FOLIOLE_CODEX_COMMAND?.trim();
  const desktopCommands = platform === 'win32' ? await findWindowsDesktopCodexCommands(env) : [];
  const macosCommands = platform === 'darwin' ? findMacosCodexCommands(env) : [];
  return [...new Set([
    ...(configuredCommand ? [configuredCommand] : []),
    ...desktopCommands,
    ...macosCommands,
    ...(platform === 'darwin' ? [] : ['codex'])
  ])];
}

export function findMacosCodexCommands(env: NodeJS.ProcessEnv) {
  const home = env.HOME?.trim();
  return [
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    ...(home ? [path.posix.join(home, '.local', 'bin', 'codex')] : []),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex'
  ];
}

export async function findWindowsDesktopCodexCommands(env: NodeJS.ProcessEnv) {
  const localAppData = env.LOCALAPPDATA;
  if (!localAppData) return [];
  const binRoot = path.join(localAppData, 'OpenAI', 'Codex', 'bin');
  try {
    const entries = await fs.promises.readdir(binRoot, { withFileTypes: true });
    const candidates = await Promise.all(entries
      .filter((entry) => entry.isDirectory() && HASH_DIRECTORY_PATTERN.test(entry.name))
      .map((entry) => readDesktopCandidate(binRoot, entry.name)));
    return candidates
      .filter((candidate): candidate is DesktopCandidate => candidate !== null)
      .sort((left, right) => right.modifiedAt - left.modifiedAt)
      .map((candidate) => candidate.command);
  } catch {
    return [];
  }
}

export async function probeCodexCommand(command: string, options: CodexLauncherOptions) {
  const versionResult = await probeCodexExitCode(command, ['--version'], options, PROBE_TIMEOUT_MS);
  if (versionResult !== 'ready') return versionResult;
  return await probeAppServerInitialize(command, options) ? 'ready' : 'incompatible';
}

export function spawnCodexCommand(
  command: string,
  args: string[],
  options: CodexLauncherOptions
): SpawnedCodexProcess {
  return spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: process.platform === 'win32' && !path.isAbsolute(command),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
}

interface DesktopCandidate {
  command: string;
  modifiedAt: number;
}

async function readDesktopCandidate(binRoot: string, directory: string) {
  const command = path.join(binRoot, directory, 'codex.exe');
  try {
    const info = await fs.promises.stat(command);
    return info.isFile() ? { command, modifiedAt: info.mtimeMs } : null;
  } catch {
    return null;
  }
}

async function probeCodexExitCode(
  command: string,
  args: string[],
  options: CodexLauncherOptions,
  timeoutMs: number
) {
  return new Promise<CodexCommandProbeResult>((resolve) => {
    const child = spawnCodexCommand(command, args, options);
    let settled = false;
    const finish = (result: CodexCommandProbeResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.on('error', (error: unknown) => {
      const errorCode = error && typeof error === 'object' && 'code' in error ? error.code : null;
      finish(errorCode === 'ENOENT' ? 'missing' : 'incompatible');
    });
    child.on('exit', (code) => finish(code === 0 ? 'ready' : 'incompatible'));
    setTimeout(() => {
      child.kill();
      finish('incompatible');
    }, timeoutMs).unref?.();
  });
}

async function probeAppServerInitialize(command: string, options: CodexLauncherOptions) {
  return new Promise<boolean>((resolve) => {
    const child = spawnCodexCommand(command, CODEX_APP_SERVER_ARGS, options);
    let settled = false;
    let stdout = '';
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve(ok);
    };
    child.on('error', () => finish(false));
    child.on('exit', () => finish(false));
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
      const line = stdout.split(/\r?\n/u).find(Boolean);
      if (!line) return;
      try {
        const message = JSON.parse(line) as { error?: unknown; id?: unknown; result?: unknown };
        finish(message.id === 0 && message.result !== undefined && message.error === undefined);
      } catch {
        finish(false);
      }
    });
    child.stdin.write(`${JSON.stringify({
      id: 0,
      method: 'initialize',
      params: { clientInfo: { name: 'foliole_desktop', title: 'Foliole Desktop', version: 'probe' } }
    })}\n`);
    setTimeout(() => finish(false), APP_SERVER_PROBE_TIMEOUT_MS).unref?.();
  });
}
