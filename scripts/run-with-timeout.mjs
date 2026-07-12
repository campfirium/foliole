/* global console */
import { spawn } from 'node:child_process';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

export function runWithTimeout(seconds, command, args) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !command) throw new Error('usage: run-with-timeout <seconds> <command> [args...]');
  const child = spawn(command, args, { stdio: 'inherit' });
  const timer = setTimeout(() => child.kill('SIGTERM'), seconds * 1000);
  child.once('error', () => {
    clearTimeout(timer);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    clearTimeout(timer);
    process.exitCode = signal ? 124 : (code ?? 1);
  });
  return child;
}

if (process.argv[1]?.endsWith('run-with-timeout.mjs')) {
  const [, , seconds, command, ...args] = process.argv;
  try {
    runWithTimeout(Number(seconds), command, args);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
