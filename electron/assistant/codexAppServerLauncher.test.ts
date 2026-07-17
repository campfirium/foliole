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
  const probeCommand = vi.fn<(command: string, options?: LauncherOptions) => Promise<boolean>>(async () => true);
  const spawnCommand = vi.fn<(command: string, args: string[], options?: LauncherOptions) => FakeCodexProcess>(() => {
    const process = new FakeCodexProcess();
    process.stdin.on('data', (chunk) => respondToTurnProtocol(process, chunk));
    return process;
  });
  const adapter = new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    command: 'codex',
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
    command: 'codex',
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

it('uses a signed bundled command without running candidate discovery probes', async () => {
  const process = new FakeCodexProcess();
  const mkdirSync = vi.fn();
  const probeCommand = vi.fn(async () => false);
  const spawnCommand = vi.fn(() => process);
  const adapter = new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    command: '/Applications/Foliole.app/Contents/MacOS/codex',
    env: { CODEX_HOME: '/Users/Tester/Library/Containers/Foliole/Codex' },
    launcherCwd: TEST_LAUNCHER_CWD,
    mkdirSync,
    probeCommand,
    spawnCommand,
    trustConfiguredCommand: true
  });
  process.stdin.on('data', (chunk) => {
    const message = JSON.parse(String(chunk));
    if (message.method === 'initialize') writeMessage(process, { id: message.id, result: {} });
    if (message.method === 'account/read') {
      writeMessage(process, { id: message.id, result: { requiresOpenaiAuth: true } });
    }
  });

  await expect(adapter.getStatus()).resolves.toMatchObject({
    failure: { category: 'auth_failed' },
    state: 'unavailable'
  });
  expect(probeCommand).not.toHaveBeenCalled();
  expect(mkdirSync).toHaveBeenCalledWith(TEST_LAUNCHER_CWD, { recursive: true });
  expect(mkdirSync).toHaveBeenCalledWith(
    '/Users/Tester/Library/Containers/Foliole/Codex',
    { recursive: true }
  );
  expect(spawnCommand).toHaveBeenCalledWith(
    '/Applications/Foliole.app/Contents/MacOS/codex',
    ['app-server', '--disable', 'code_mode'],
    expect.objectContaining({ cwd: TEST_LAUNCHER_CWD })
  );
});

function respondToTurnProtocol(process: FakeCodexProcess, chunk: Buffer) {
  for (const line of chunk.toString().trim().split('\n').filter(Boolean)) {
    const message = JSON.parse(line);
    if (message.id === 0) writeMessage(process, { id: 0, result: {} });
    if (message.method === 'account/read') {
      writeMessage(process, { id: message.id, result: { requiresOpenaiAuth: false } });
    }
    if (message.method === 'thread/start')
      writeMessage(process, { id: message.id, result: { thread: { id: 'thr_1' } } });
    if (message.method === 'turn/start') {
      writeMessage(process, { method: 'turn/started', params: { turn: { id: 'turn_1' } } });
      writeMessage(process, { method: 'turn/completed', params: { turn: { id: 'turn_1', status: 'completed' } } });
    }
  }
}
