/* global process */

import { spawn, spawnSync } from 'node:child_process';

import {
  buildElectronNodeArgs,
  buildElectronNodeEnv
} from './electron-sqlite-runner.mjs';

export function buildSharedBucketInvocation(
  reportPath,
  targets,
  electronPath,
  repoRoot = process.cwd(),
  env = process.env
) {
  const scriptArgs = [
    'scripts/run-vitest-with-summary.mjs',
    reportPath,
    '--',
    '--silent=passed-only',
    '--pool=threads',
    '--maxWorkers=2',
    '--no-file-parallelism',
    ...targets
  ];
  return {
    args: buildElectronNodeArgs(scriptArgs[0], scriptArgs.slice(1)),
    electronPath,
    options: {
      cwd: repoRoot,
      env: buildElectronNodeEnv(env, repoRoot),
      stdio: ['ignore', 'pipe', 'pipe']
    }
  };
}

function terminateChildTree(child) {
  if (!child.pid) {
    child.kill('SIGTERM');
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      timeout: 1000
    });
    return;
  }
  child.kill('SIGTERM');
  globalThis.setTimeout(() => child.kill('SIGKILL'), 1000).unref();
}

export function runSharedBucketVitest(reportPath, targets, timeoutMs, electronPath, repoRoot) {
  const invocation = buildSharedBucketInvocation(
    reportPath,
    targets,
    electronPath,
    repoRoot
  );
  const child = spawn(invocation.electronPath, invocation.args, invocation.options);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code, timedOut = false) => {
      if (settled) return;
      settled = true;
      if (timer) globalThis.clearTimeout(timer);
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve({ code, timedOut });
    };
    child.stdout?.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
    const timer = Number.isFinite(timeoutMs)
      ? globalThis.setTimeout(() => {
        terminateChildTree(child);
        finish(1, true);
      }, timeoutMs)
      : null;
    timer?.unref();
    child.on('close', (code) => finish(code ?? 1));
  });
}
