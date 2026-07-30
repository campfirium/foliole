import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

const DEFAULT_LINE_LIMIT = 500;
const TREE_KILL_TIMEOUT_MS = 15_000;

function timeoutError(errorCode, timeoutMs, command) {
  const error = new Error(`${command} timed out after ${timeoutMs}ms`);
  error.code = errorCode;
  return error;
}

export function terminateProcessTree(pid, {
  killProcess = process.kill,
  platform = process.platform,
  runCommand = spawnSync
} = {}) {
  if (!pid) return;
  if (platform !== 'win32') {
    killProcess(pid, 'SIGKILL');
    return;
  }
  const result = runCommand('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
    encoding: 'utf8',
    shell: false,
    timeout: TREE_KILL_TIMEOUT_MS
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr || result.stdout || 'unknown taskkill failure';
    const error = new Error(`taskkill failed: ${String(detail).trim()}`);
    error.code = 'process_tree_termination_failed';
    throw error;
  }
}

export function executeBounded(command, args, {
  lineLimit = DEFAULT_LINE_LIMIT,
  onSpawn = () => {},
  platform = process.platform,
  spawnImpl = spawn,
  terminateTree = terminateProcessTree,
  timeoutCode = 'command_timeout',
  timeoutMs,
  ...options
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be a positive integer');
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { ...options, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    onSpawn(child);
    const lines = [];
    let output = '';
    let stderr = '';
    let stdout = '';
    let timedOut = false;
    let terminationError = null;
    const collect = (stream) => (chunk) => {
      output += chunk;
      if (stream === 'stdout') stdout += chunk;
      else stderr += chunk;
      lines.push(...String(chunk).split(/\r?\n/u).filter(Boolean));
      if (lines.length > lineLimit) lines.splice(0, lines.length - lineLimit);
    };
    child.stdout?.on('data', collect('stdout'));
    child.stderr?.on('data', collect('stderr'));
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        terminateTree(child.pid, { platform });
      } catch (error) {
        terminationError = error;
        child.kill('SIGKILL');
        reject(error);
        return;
      }
      const error = timeoutError(timeoutCode, timeoutMs, command);
      Object.assign(error, { lines: [...lines], output, stderr, stdout });
      reject(error);
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (terminationError) return reject(terminationError);
      if (timedOut) return;
      resolve({ code: signal ? 1 : code ?? 1, lines, output, stderr, stdout });
    });
  });
}
