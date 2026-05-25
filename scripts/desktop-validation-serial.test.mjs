// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { assertAgentCompletionMessage } from './codex/codex-task-completion.mjs';
import { formatQueueActiveMessage, resolveDefaultPreviewCommand } from './desktop-validation-serial.mjs';
import {
  runSerial,
  serialProcess,
  stubCommands,
  waitForFile,
  withTempFixture,
  writeDeadLock
} from './desktop-validation-serial-test-utils.mjs';

describe('desktop-validation-serial.mjs', () => {
  it('routes the default preview command by workspace host', () => {
    expect(resolveDefaultPreviewCommand({ DESKTOP_VALIDATION_SERIAL_FORCE_WSL: '1' })).toEqual([
      'npm',
      'run',
      'windows:preview'
    ]);
    expect(resolveDefaultPreviewCommand({ DESKTOP_VALIDATION_SERIAL_FORCE_WSL: '0' })).toEqual([
      'npm',
      'run',
      'windows:preview:native'
    ]);
  });

  it('keeps concurrent validation commands from interleaving', async () => {
    await withTempFixture(async ({ logFile, runtimeDir, stub }) => {
      const env = { SERIAL_TEST_LOG: logFile };
      const commands = stubCommands(stub, 80, 80);
      const first = runSerial({ commands, extraEnv: env, runLabel: 'first', runtimeDir });
      const second = runSerial({ commands, extraEnv: env, runLabel: 'second', runtimeDir });

      const results = await Promise.all([first, second]);
      const log = (await readFile(logFile, 'utf8')).trim().split('\n');
      const firstStart = log.indexOf('first:lint:start');
      const firstEnd = log.indexOf('first:preview:end');
      const secondStart = log.indexOf('second:lint:start');
      const secondEnd = log.indexOf('second:preview:end');

      expect(results.map((result) => result.code)).toEqual([0, 0]);
      expect(firstStart).toBeGreaterThanOrEqual(0);
      expect(secondStart).toBeGreaterThanOrEqual(0);
      expect(firstEnd < secondStart || secondEnd < firstStart).toBe(true);
    });
  }, 10000);

  it('keeps the later caller alive while the queue is held', async () => {
    await withTempFixture(async ({ logFile, runtimeDir, stub }) => {
      const env = { SERIAL_TEST_LOG: logFile };
      const first = serialProcess({
        commands: stubCommands(stub, 350, 20),
        extraEnv: env,
        runLabel: 'first',
        runtimeDir
      });
      const second = serialProcess({
        commands: stubCommands(stub, 20, 20),
        extraEnv: env,
        runLabel: 'second',
        runtimeDir
      });

      const early = await Promise.race([
        second.close.then(() => 'closed'),
        new Promise((resolve) => globalThis.setTimeout(() => resolve('alive'), 120))
      ]);
      const results = await Promise.all([first.close, second.close]);

      expect(early).toBe('alive');
      expect(results.map((result) => result.code)).toEqual([0, 0]);
    });
  }, 10000);

  it('releases the lock after a command fails', async () => {
    await withTempFixture(async ({ logFile, runtimeDir, stub }) => {
      const env = { SERIAL_TEST_LOG: logFile };
      const first = runSerial({
        commands: stubCommands(stub, 50, 50, 7),
        extraEnv: env,
        runLabel: 'first',
        runtimeDir
      });
      const second = runSerial({
        commands: stubCommands(stub, 20, 20),
        extraEnv: env,
        runLabel: 'second',
        runtimeDir
      });

      const results = await Promise.all([first, second]);
      const log = await readFile(logFile, 'utf8');

      expect(results.map((result) => result.code).sort()).toEqual([0, 7]);
      expect(log).toContain('second:preview:end');
    });
  }, 10000);

  it('takes over a lock owned by a dead pid', async () => {
    await withTempFixture(async ({ logFile, runtimeDir, stub }) => {
      await writeDeadLock(runtimeDir);

      const result = await runSerial({
        commands: stubCommands(stub, 10, 10),
        extraEnv: { SERIAL_TEST_LOG: logFile },
        runLabel: 'next',
        runtimeDir
      });

      expect(result.code).toBe(0);
      expect(await readFile(logFile, 'utf8')).toContain('next:preview:end');
    });
  }, 10000);

  it('clears its lock when interrupted', async () => {
    await withTempFixture(async ({ logFile, runtimeDir, stub }) => {
      const running = serialProcess({
        commands: stubCommands(stub, 1000, 10),
        extraEnv: { SERIAL_TEST_LOG: logFile },
        runLabel: 'interrupted',
        runtimeDir
      });

      await waitForFile(path.join(runtimeDir, 'resource-gate.node-heavy.lock'));
      running.child.kill('SIGTERM');
      const result = await running.close;
      const next = await runSerial({
        commands: stubCommands(stub, 10, 10),
        extraEnv: { SERIAL_TEST_LOG: logFile },
        runLabel: 'next',
        runtimeDir
      });

      expect(result.code).not.toBe(0);
      expect(next.code).toBe(0);
    });
  }, 10000);

  it('prints queue progress that does not trip Codex preview failure guards', () => {
    const message = formatQueueActiveMessage({ ageSeconds: 30, pid: 1234 });

    expect(message).toContain('[validation-resource-gate]');
    expect(message).not.toMatch(/waiting|failed|not run/iu);
    expect(() => assertAgentCompletionMessage(message)).not.toThrow();
  });
});
