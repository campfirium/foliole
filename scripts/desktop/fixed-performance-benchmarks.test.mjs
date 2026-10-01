// @vitest-environment node
import process from 'node:process';
import console from 'node:console';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, vi } from 'vitest';

const calls = vi.hoisted(() => ({ commands: [], output: null, build: vi.fn(), native: vi.fn() }));
vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events');
  const { mkdir, writeFile } = await import('node:fs/promises');
  return {
    execFileSync: () => 'test-source',
    spawn: (bin, args, options) => {
      calls.commands.push({ bin, args });
      const child = new EventEmitter();
      void (async () => {
        await Promise.resolve();
        const output = options.env.FOLIOLE_BENCHMARK_OUTPUT;
        if (output) {
          calls.output = path.dirname(output);
          await mkdir(output);
          await writeFile(path.join(output, 'http-100.json'), JSON.stringify({ size: 100,
            boundary: 'test HTTP failure', completed: false, failure: 'incorrect body', samples: [] }));
        }
        child.emit('exit', 1);
      })();
      return child;
    }
  };
});
vi.mock('./playwright-desktop-native-hidden.mjs', () => ({
  createNativeHiddenDesktopBuildCommands: calls.build,
  runNativeHiddenDesktopGate: calls.native
}));

test('failed HTTP correctness preserves evidence and stops before quality, build and native sampling', async () => {
  const previousArgs = process.argv;
  const previousExitCode = process.exitCode;
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    process.argv = ['node', 'fixed-performance-benchmarks.mjs', 'core'];
    await import('./fixed-performance-benchmarks.mjs');
    const manifest = JSON.parse(await readFile(path.join(calls.output, 'manifest.json'), 'utf8'));
    const report = JSON.parse(await readFile(path.join(calls.output, 'summary.json'), 'utf8'));
    expect(calls.commands).toHaveLength(1);
    expect(calls.commands[0].args).toContain('scripts/desktop/fixed-performance-http.test.mjs');
    expect(calls.build).not.toHaveBeenCalled();
    expect(calls.native).not.toHaveBeenCalled();
    expect(manifest).toMatchObject({ httpExitCode: 1, preflightExitCode: null,
      desktopExitCode: null, buildBefore: null, buildAfter: null, exitCode: 1 });
    expect(report.verdict).toBe('incomplete or failed');
    expect(report.scenarios[0]).toMatchObject({ kind: 'http', completed: false, failure: 'incorrect body' });
    expect(process.exitCode).toBe(1);
  } finally {
    process.argv = previousArgs;
    process.exitCode = previousExitCode;
    log.mockRestore();
    if (calls.output) await rm(calls.output, { recursive: true, force: true });
  }
});
