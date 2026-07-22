/* global console */
import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

export function resolvePortableCommand(command, args, options = {}) {
  const platform = options.platform ?? process.platform;
  const npmExecPath = options.npmExecPath ?? process.env.npm_execpath;
  if (platform === 'win32' && command === 'npm' && npmExecPath) {
    return { args: [npmExecPath, ...args], command: options.nodeExecPath ?? process.execPath };
  }
  return { args, command };
}

export function runWithTimeout(seconds, command, args, options = {}) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !command) throw new Error('usage: run-with-timeout <seconds> <command> [args...]');
  const stdoutFd = options.stdoutFile ? openSync(options.stdoutFile, 'w') : null;
  const portable = resolvePortableCommand(command, args, options);
  const child = spawn(portable.command, portable.args, { stdio: ['inherit', stdoutFd ?? 'inherit', 'inherit'] });
  const timer = setTimeout(() => child.kill('SIGTERM'), seconds * 1000);
  let outputClosed = false;
  const closeOutput = () => {
    if (stdoutFd === null || outputClosed) return;
    outputClosed = true;
    closeSync(stdoutFd);
  };
  child.once('error', (error) => {
    clearTimeout(timer);
    closeOutput();
    console.error(`[run-with-timeout] failed to start ${portable.command}: ${error.message}`);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    clearTimeout(timer);
    closeOutput();
    process.exitCode = signal ? 124 : (code ?? 1);
  });
  return child;
}

if (process.argv[1]?.endsWith('run-with-timeout.mjs')) {
  const [, , seconds, ...commandArgs] = process.argv;
  const stdoutFile = commandArgs[0] === '--stdout-file' ? commandArgs.splice(0, 2)[1] : undefined;
  const [command, ...args] = commandArgs;
  try {
    runWithTimeout(Number(seconds), command, args, { stdoutFile });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
