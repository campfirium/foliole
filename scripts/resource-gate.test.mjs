// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { assertAgentCompletionMessage } from './codex/codex-task-completion.mjs';
import { formatGateQueueMessage } from './lib/resource-gate.mjs';
import { normalizeSpawnCommand } from './lib/windows-spawn-command.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'with-resource-gate.mjs');

function runGate({ className, command, env = {}, runtimeDir }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [GATE_SCRIPT, className, '--', ...command], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        FOLIOLE_RESOURCE_GATE_HELD: '',
        FOLIOLE_RESOURCE_GATE_POLL_MS: '25',
        FOLIOLE_RESOURCE_GATE_PROGRESS_MS: '50',
        FOLIOLE_RESOURCE_GATE_RUNTIME_DIR: runtimeDir,
        ...env
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
    child.on('close', (code) => {
      resolve({ code, stderr, stdout });
    });
  });
}

async function withFixture(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'resource-gate-'));
  try {
    const runtimeDir = path.join(tempDir, 'runtime');
    const logFile = path.join(tempDir, 'runs.log');
    const stub = path.join(tempDir, 'stub.mjs');
    await writeFile(
      stub,
      [
        "import { appendFile } from 'node:fs/promises';",
        "import { setTimeout as delay } from 'node:timers/promises';",
        "const [label, ms = '0', code = '0'] = process.argv.slice(2);",
        "await appendFile(process.env.RESOURCE_GATE_LOG, `${label}:start\\n`);",
        'await delay(Number(ms));',
        "await appendFile(process.env.RESOURCE_GATE_LOG, `${label}:end\\n`);",
        'process.exit(Number(code));'
      ].join('\n'),
      'utf8'
    );
    return await fn({ logFile, runtimeDir, stub, tempDir });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

describe('resource gate', () => {
  it('serializes node-heavy commands', async () => {
    await withFixture(async ({ logFile, runtimeDir, stub }) => {
      const env = { RESOURCE_GATE_LOG: logFile };
      const first = runGate({ className: 'node-heavy', command: [process.execPath, stub, 'first', '100'], env, runtimeDir });
      const second = runGate({ className: 'node-heavy', command: [process.execPath, stub, 'second', '20'], env, runtimeDir });
      const results = await Promise.all([first, second]);
      const log = (await readFile(logFile, 'utf8')).trim().split('\n');

      expect(results.map((result) => result.code)).toEqual([0, 0]);
      expect(log.indexOf('first:end') < log.indexOf('second:start') || log.indexOf('second:end') < log.indexOf('first:start')).toBe(true);
    });
  }, 10000);

  it('makes preview conflict with node-heavy', async () => {
    await withFixture(async ({ logFile, runtimeDir, stub }) => {
      const env = { RESOURCE_GATE_LOG: logFile };
      const preview = runGate({ className: 'preview', command: [process.execPath, stub, 'preview', '120'], env, runtimeDir });
      const nodeHeavy = runGate({ className: 'node-heavy', command: [process.execPath, stub, 'test', '10'], env, runtimeDir });
      await Promise.all([preview, nodeHeavy]);
      const log = (await readFile(logFile, 'utf8')).trim().split('\n');

      expect(log.indexOf('preview:end') < log.indexOf('test:start') || log.indexOf('test:end') < log.indexOf('preview:start')).toBe(true);
    });
  }, 10000);

  it('passes through when the resource is already held by the current chain', async () => {
    await withFixture(async ({ logFile, runtimeDir, stub }) => {
      await mkdir(runtimeDir, { recursive: true });
      await writeFile(path.join(runtimeDir, 'resource-gate.node-heavy.lock'), '{"pid":99999999}\n', 'utf8');
      const result = await runGate({
        className: 'node-heavy',
        command: [process.execPath, stub, 'reentrant', '1'],
        env: { FOLIOLE_RESOURCE_GATE_HELD: 'node-heavy', RESOURCE_GATE_LOG: logFile },
        runtimeDir
      });

      expect(result.code).toBe(0);
      expect(await readFile(logFile, 'utf8')).toContain('reentrant:end');
    });
  }, 10000);

  it('preserves command failure and lets the next caller proceed', async () => {
    await withFixture(async ({ logFile, runtimeDir, stub }) => {
      const env = { RESOURCE_GATE_LOG: logFile };
      const failed = await runGate({ className: 'node-heavy', command: [process.execPath, stub, 'bad', '1', '6'], env, runtimeDir });
      const next = await runGate({ className: 'node-heavy', command: [process.execPath, stub, 'next', '1'], env, runtimeDir });

      expect(failed.code).toBe(6);
      expect(next.code).toBe(0);
      expect(await readFile(logFile, 'utf8')).toContain('next:end');
    });
  }, 10000);

  it('terminates timed out commands and lets the next caller proceed', async () => {
    await withFixture(async ({ logFile, runtimeDir, stub }) => {
      const baseEnv = {
        FOLIOLE_WINDOWS_PROCESS_EXIT_TIMEOUT_MS: '1000',
        RESOURCE_GATE_LOG: logFile
      };
      const timeoutEnv = {
        ...baseEnv,
        FOLIOLE_RESOURCE_GATE_COMMAND_TIMEOUT_MS: '200',
      };
      const timedOut = await runGate({
        className: 'node-heavy',
        command: [process.execPath, stub, 'slow', '30000'],
        env: timeoutEnv,
        runtimeDir
      });
      const next = await runGate({
        className: 'node-heavy',
        command: [process.execPath, stub, 'after-timeout', '1'],
        env: baseEnv,
        runtimeDir
      });
      const log = await readFile(logFile, 'utf8');

      expect(timedOut.code).toBe(1);
      expect(timedOut.stdout).toContain('timed out');
      expect(next, `${next.stdout}\n${next.stderr}`).toMatchObject({ code: 0 });
      expect(log).toContain('slow:start');
      expect(log).not.toContain('slow:end');
      expect(log).toContain('after-timeout:end');
    });
  }, 20000);

  it('takes over stale locks and prints safe queue progress', async () => {
    await withFixture(async ({ logFile, runtimeDir, stub }) => {
      await mkdir(runtimeDir, { recursive: true });
      await writeFile(
        path.join(runtimeDir, 'resource-gate.node-heavy.lock'),
        `${JSON.stringify({
          className: 'node-heavy',
          heartbeatAt: Date.now() - 10_000,
          pid: 99999999,
          schemaVersion: 1,
          startedAt: Date.now() - 10_000
        })}\n`,
        'utf8'
      );
      const result = await runGate({
        className: 'node-heavy',
        command: [process.execPath, stub, 'takeover', '1'],
        env: { FOLIOLE_RESOURCE_GATE_STALE_MS: '1', RESOURCE_GATE_LOG: logFile },
        runtimeDir
      });
      const message = formatGateQueueMessage({ className: 'node-heavy', holderPid: 1234, resource: 'node-heavy', seconds: 1 });

      expect(result.code).toBe(0);
      expect(message).not.toMatch(/preview|failed|error|STARTED|SYNCED/iu);
      expect(() => assertAgentCompletionMessage(message)).not.toThrow();
    });
  }, 10000);

  it('launches npm through cmd on Windows', () => {
    expect(normalizeSpawnCommand(['npm', 'run', 'electron:compile:raw'], 'win32')).toEqual({
      args: ['/d', '/s', '/c', 'npm', 'run', 'electron:compile:raw'],
      bin: 'cmd.exe'
    });
    expect(normalizeSpawnCommand(['node', '--version'], 'win32')).toEqual({
      args: ['--version'],
      bin: 'node'
    });
  });
});
