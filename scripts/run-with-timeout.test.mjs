import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
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

  it('writes child stdout directly to a portable output file', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'run-with-timeout-'));
    const outputFile = path.join(tempRoot, 'output.json');
    try {
      await expect(run([
        '2', '--stdout-file', outputFile, process.execPath, '-e', 'process.stdout.write(JSON.stringify({ ok: true }))'
      ])).resolves.toBe(0);
      await expect(readFile(outputFile, 'utf8')).resolves.toBe('{"ok":true}');
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
