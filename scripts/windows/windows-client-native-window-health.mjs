/* global process */

import { runCapture } from './windows-client-native-process.mjs';

export async function readNativeWindowHealth({ nativeWindowHealthScript, repoRoot, runtimePid }) {
  if (process.platform !== 'win32') {
    return { ok: true };
  }
  const result = await runCapture('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    nativeWindowHealthScript,
    '-RuntimePid',
    String(runtimePid)
  ], { cwd: repoRoot, timeoutMs: 10000 });
  if (result.code !== 0) {
    return { ok: false, reason: result.stderr.trim() || result.stdout.trim() || 'window-health-check-failed' };
  }
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return { ok: false, reason: 'window-health-output-invalid' };
  }
}

export function formatWindowHealthFailure(windowHealth) {
  const reason = windowHealth.reason ? ` reason=${windowHealth.reason}` : '';
  const runtimePid = windowHealth.runtimePid ? ` runtime_pid=${windowHealth.runtimePid}` : '';
  const windowHandle = Object.hasOwn(windowHealth, 'windowHandle') ? ` window_handle=${windowHealth.windowHandle}` : '';
  const responding = Object.hasOwn(windowHealth, 'responding') ? ` responding=${windowHealth.responding}` : '';
  return `${reason}${runtimePid}${windowHandle}${responding}`;
}
