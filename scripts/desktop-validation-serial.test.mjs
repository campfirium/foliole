// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { assertAgentCompletionMessage } from './codex/codex-task-completion.mjs';
import { formatQueueActiveMessage } from './desktop-validation-serial.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERIAL_SCRIPT = path.join(REPO_ROOT, 'scripts', 'desktop-validation-serial.mjs');

function runSerial({ commands, runtimeDir, runLabel, extraEnv = {} }) {
  return serialProcess({ commands, extraEnv, runLabel, runtimeDir }).close;
}

function serialProcess({ commands, runtimeDir, runLabel, extraEnv = {} }) {
  const child = spawn(process.execPath, [SERIAL_SCRIPT], {
    cwd: REPO_ROOT,
      env: {
        ...process.env,
        DESKTOP_VALIDATION_SERIAL_COMMANDS_JSON: JSON.stringify(commands),
        FOLIOLE_RESOURCE_GATE_HELD: '',
        DESKTOP_VALIDATION_SERIAL_PROGRESS_MS: '50',
      DESKTOP_VALIDATION_SERIAL_POLL_MS: '25',
      DESKTOP_VALIDATION_SERIAL_RUNTIME_DIR: runtimeDir,
      SERIAL_TEST_RUN_LABEL: runLabel,
      ...extraEnv
    }
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const close = new Promise((resolve) => {
    child.on('close', (code) => {
      resolve({ code, stderr, stdout });
    });
  });
  return { child, close };
}

async function createStub(tempDir) {
  const script = path.join(tempDir, 'stub-command.mjs');
  await writeFile(
    script,
    [
      "import { appendFile } from 'node:fs/promises';",
      "import { setTimeout as delay } from 'node:timers/promises';",
      "const [label, ms = '0', code = '0'] = process.argv.slice(2);",
      "const run = process.env.SERIAL_TEST_RUN_LABEL ?? 'unknown';",
      "await appendFile(process.env.SERIAL_TEST_LOG, `${run}:${label}:start\\n`);",
      'await delay(Number(ms));',
      "await appendFile(process.env.SERIAL_TEST_LOG, `${run}:${label}:end\\n`);",
      'process.exit(Number(code));'
    ].join('\n'),
    'utf8'
  );
  return script;
}

async function withTempFixture(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'desktop-validation-serial-'));
  try {
    const runtimeDir = path.join(tempDir, 'runtime');
    const logFile = path.join(tempDir, 'commands.log');
    const stub = await createStub(tempDir);
    return await fn({ logFile, runtimeDir, stub, tempDir });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function stubCommands(stub, lintMs = 50, previewMs = 50, lintCode = 0) {
  return [
    [process.execPath, stub, 'lint', String(lintMs), String(lintCode)],
    [process.execPath, stub, 'preview', String(previewMs), '0']
  ];
}

describe('desktop-validation-serial.mjs', () => {
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
      await mkdir(runtimeDir, { recursive: true });
      await writeFile(
        path.join(runtimeDir, 'resource-gate.node-heavy.lock'),
        `${JSON.stringify({
          className: 'preview',
          command: 'validate:desktop:serial',
          heartbeatAt: Date.now(),
          pid: 99999999,
          resource: 'node-heavy',
          schemaVersion: 1,
          startedAt: Date.now()
        })}\n`,
        'utf8'
      );

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

async function waitForFile(filePath, timeoutMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await readFile(filePath, 'utf8');
      return;
    } catch (error) {
      if (!('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for file: ${filePath}`);
}
