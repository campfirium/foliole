/* global process */

import { runCapture } from './windows-client-native-process.mjs';

export async function startNativeDevRunner({ head, logs, nativeStartScript, repoRoot, session }) {
  const result = await runCapture('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    nativeStartScript,
    '-NodePath',
    process.execPath,
    '-WorkDir',
    repoRoot,
    '-Session',
    session,
    '-RuntimeHead',
    head,
    '-StdoutLog',
    logs.stdoutLog,
    '-StderrLog',
    logs.stderrLog
  ], { cwd: repoRoot, timeoutMs: 30000 });
  const shellPid = Number.parseInt(result.stdout.match(/shell_pid=(\d+)/u)?.[1] ?? '', 10);
  if (result.code !== 0 || !Number.isInteger(shellPid)) {
    const reason = result.stderr.trim() || result.stdout.trim() || result.error?.message || 'missing shell_pid';
    throw new Error(`native dev runner start failed: ${reason}`);
  }
  return shellPid;
}
