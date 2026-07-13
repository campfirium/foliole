// @vitest-environment node
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { resolveDefaultPreviewCommand } from './desktop-validation-serial.mjs';
import {
  runSerial,
  serialProcess,
  stubCommands,
  withTempFixture
} from './test-utils/desktop-validation-serial-test-utils.mjs';

async function waitForLogText(logFile, text, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await readFile(logFile, 'utf8')).includes(text)) return;
    } catch {
      // Keep polling until the stub creates the log file.
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for log text: ${text}`);
}

describe('desktop-validation-serial.mjs', () => {
  it('uses the Windows native preview entry without a WSL branch', () => {
    expect(resolveDefaultPreviewCommand()).toEqual([
      'npm',
      'run',
      'windows:preview:native'
    ]);
  });

  it('runs lint before preview within one invocation', async () => {
    await withTempFixture(async ({ logFile, runtimeDir, stub }) => {
      const env = { SERIAL_TEST_LOG: logFile };
      const commands = stubCommands(stub, 80, 80);
      const result = await runSerial({ commands, extraEnv: env, runLabel: 'single', runtimeDir });

      const log = (await readFile(logFile, 'utf8')).trim().split('\n');

      expect(result.code).toBe(0);
      expect(log).toEqual([
        'single:lint:start',
        'single:lint:end',
        'single:preview:start',
        'single:preview:end'
      ]);
    });
  }, 10000);

  it('stops before preview when lint fails', async () => {
    await withTempFixture(async ({ logFile, runtimeDir, stub }) => {
      const env = { SERIAL_TEST_LOG: logFile };
      const result = await runSerial({
        commands: stubCommands(stub, 50, 50, 7),
        extraEnv: env,
        runLabel: 'failed',
        runtimeDir
      });

      const log = await readFile(logFile, 'utf8');

      expect(result.code).toBe(7);
      expect(log).toContain('failed:lint:end');
      expect(log).not.toContain('failed:preview:start');
    });
  }, 10000);

  it('stops its active child when interrupted', async () => {
    await withTempFixture(async ({ logFile, runtimeDir, stub }) => {
      const running = serialProcess({
        commands: stubCommands(stub, 1000, 10),
        extraEnv: { SERIAL_TEST_LOG: logFile },
        runLabel: 'interrupted',
        runtimeDir
      });

      await waitForLogText(logFile, 'interrupted:lint:start');
      running.child.kill('SIGTERM');
      const result = await running.close;

      expect(result.code).not.toBe(0);
      expect(await readFile(logFile, 'utf8')).toContain('interrupted:lint:start');
    });
  }, 10000);
});
