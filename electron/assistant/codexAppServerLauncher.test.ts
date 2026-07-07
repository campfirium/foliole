// @vitest-environment node
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { expect, it, vi } from 'vitest';

import { CodexAppServerAdapter } from './codexAppServerAdapter.js';

const TEST_LAUNCHER_CWD = 'C:\\Foliole\\Widgets\\Foliole Aide';
type LauncherOptions = { cwd?: string; env?: NodeJS.ProcessEnv };

class FakeCodexProcess extends EventEmitter {
  readonly stderr = new PassThrough();
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly kill = vi.fn(() => undefined);
}

function writeMessage(process: FakeCodexProcess, message: unknown) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

it('uses the same sanitized launcher environment for status probes and app-server children', async () => {
  const process = new FakeCodexProcess();
  const probeCommand = vi.fn<(command: string, options?: LauncherOptions) => Promise<boolean>>(async () => true);
  const spawnCommand = vi.fn<(command: string, args: string[], options?: LauncherOptions) => FakeCodexProcess>(() => process);
  const adapter = new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    env: {
      CODEX_HOME: 'C:\\Users\\Tester\\.codex',
      CODEX_SANDBOX_NETWORK_DISABLED: '1',
      CODEX_THREAD_ID: 'thread-from-parent',
      CODEX_UNKNOWN_SESSION: 'session-leak',
      HOME: 'C:\\Users\\Tester',
      Path: 'C:\\Windows\\System32'
    },
    launcherCwd: TEST_LAUNCHER_CWD,
    mkdirSync: () => undefined,
    probeCommand,
    spawnCommand,
    timeoutMs: 1000
  });
  process.stdin.on('data', (chunk) => respondToTurnProtocol(process, chunk));

  await adapter.getStatus();
  await adapter.sendMessage({ clientTurnId: 'client-1', message: 'Hi' });

  const probeOptions = probeCommand.mock.calls[0]?.[1];
  const spawnOptions = spawnCommand.mock.calls[0]?.[2];
  expect(probeOptions).toMatchObject({ cwd: TEST_LAUNCHER_CWD });
  expect(spawnOptions).toMatchObject({ cwd: TEST_LAUNCHER_CWD });
  expect(spawnOptions?.env).toMatchObject({
    CODEX_HOME: 'C:\\Users\\Tester\\.codex',
    HOME: 'C:\\Users\\Tester',
    Path: 'C:\\Windows\\System32'
  });
  expect(spawnOptions?.env).not.toHaveProperty('CODEX_SANDBOX_NETWORK_DISABLED');
  expect(spawnOptions?.env).not.toHaveProperty('CODEX_THREAD_ID');
  expect(spawnOptions?.env).not.toHaveProperty('CODEX_UNKNOWN_SESSION');
});

it('maps launcher directory creation failures to launch_failed without probing or spawning', async () => {
  const probeCommand = vi.fn(async () => true);
  const spawnCommand = vi.fn();
  const adapter = new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    launcherCwd: TEST_LAUNCHER_CWD,
    mkdirSync: () => {
      throw new Error('no access');
    },
    probeCommand,
    spawnCommand
  });

  await expect(adapter.getStatus()).resolves.toMatchObject({
    failure: { category: 'launch_failed' },
    state: 'unavailable'
  });
  await expect(adapter.sendMessage({ clientTurnId: 'client-1', message: 'Hi' })).resolves.toMatchObject({
    failure: { category: 'launch_failed' },
    state: 'failed'
  });
  expect(probeCommand).not.toHaveBeenCalled();
  expect(spawnCommand).not.toHaveBeenCalled();
});

function respondToTurnProtocol(process: FakeCodexProcess, chunk: Buffer) {
  for (const line of chunk.toString().trim().split('\n').filter(Boolean)) {
    const message = JSON.parse(line);
    if (message.id === 0) writeMessage(process, { id: 0, result: {} });
    if (message.method === 'thread/start')
      writeMessage(process, { id: message.id, result: { thread: { id: 'thr_1' } } });
    if (message.method === 'turn/start') {
      writeMessage(process, { method: 'turn/started', params: { turn: { id: 'turn_1' } } });
      writeMessage(process, { method: 'turn/completed', params: { turn: { id: 'turn_1' } } });
    }
  }
}
