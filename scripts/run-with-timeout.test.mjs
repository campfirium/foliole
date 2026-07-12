import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const RUNNER = path.resolve('scripts/run-with-timeout.mjs');

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RUNNER, ...args]);
    child.once('exit', (code) => resolve(code));
  });
}

describe('portable timeout runner', () => {
  it('preserves a completed command exit code', async () => {
    await expect(run(['2', process.execPath, '-e', 'process.exit(7)'])).resolves.toBe(7);
  });

  it('returns the conventional timeout code', async () => {
    await expect(run(['0.05', process.execPath, '-e', 'setTimeout(() => {}, 1000)'])).resolves.toBe(124);
  });
});
