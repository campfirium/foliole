/* global console */

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ALLOWED_ARGS = new Set(['--route', '--route-json']);

export function validateQualityFastArgs(args) {
  if (args.length > 1 || args.some((arg) => !ALLOWED_ARGS.has(arg))) {
    throw new Error('quality:fast accepts only --route or --route-json; aggregate quality is hosted-only');
  }
  return args;
}

export function resolveQualityFastCommand(platform, args) {
  validateQualityFastArgs(args);
  if (platform === 'win32') {
    return { args: [path.resolve(SCRIPT_DIR, '../windows/quality-fast-native.mjs'), ...args], command: process.execPath };
  }
  if (platform === 'darwin' || platform === 'linux') {
    return { args: [path.resolve(SCRIPT_DIR, 'quality-gate-fast.sh'), ...args], command: 'bash' };
  }
  throw new Error(`unsupported platform: ${platform}`);
}

export function runQualityFast(args = process.argv.slice(2), platform = process.platform) {
  const resolved = resolveQualityFastCommand(platform, args);
  const child = spawn(resolved.command, resolved.args, { stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  child.once('error', () => { process.exitCode = 1; });
  child.once('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
  return child;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    runQualityFast();
  } catch (error) {
    console.error(`[quality-fast] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
