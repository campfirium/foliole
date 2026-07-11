// @vitest-environment node

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { expect, it, vi } from 'vitest';

import { CodexAppServerAdapter } from './codexAppServerAdapter.js';

class FakeCodexProcess extends EventEmitter {
  readonly stderr = new PassThrough();
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly kill = vi.fn(() => undefined);
}

function writeMessage(process: FakeCodexProcess, message: unknown) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

it('does not treat unknown app-server methods as successful turns', async () => {
  const process = new FakeCodexProcess();
  const adapter = new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    command: 'codex',
    launcherCwd: 'C:\\Foliole\\Widgets\\Foliole Aide',
    mkdirSync: () => undefined,
    probeCommand: async () => true,
    spawnCommand: vi.fn(() => process),
    timeoutMs: 10
  });
  const result = adapter.sendMessage({ clientTurnId: 'client-1', message: 'Hi' });

  writeMessage(process, { id: 0, result: {} });
  await Promise.resolve();
  writeMessage(process, { id: 1, result: { thread: { id: 'thr_1' } } });
  writeMessage(process, { method: 'item/toolCall', params: { name: 'workspace.readNode' } });

  await expect(result).resolves.toMatchObject({
    failure: { category: 'timeout' },
    state: 'failed'
  });
});

it('times out when app-server never acknowledges initialize', async () => {
  const process = new FakeCodexProcess();
  const adapter = new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    command: 'codex',
    launcherCwd: 'C:\\Foliole\\Widgets\\Foliole Aide',
    mkdirSync: () => undefined,
    probeCommand: async () => true,
    spawnCommand: vi.fn(() => process),
    timeoutMs: 10
  });

  await expect(adapter.sendMessage({ clientTurnId: 'client-1', message: 'Hi' })).resolves.toMatchObject({
    failure: { category: 'timeout' },
    state: 'failed'
  });
  expect(process.kill).toHaveBeenCalledOnce();
});

it('fails the active turn when app-server exits before completion', async () => {
  const process = new FakeCodexProcess();
  const adapter = new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    command: 'codex',
    launcherCwd: 'C:\\Foliole\\Widgets\\Foliole Aide',
    mkdirSync: () => undefined,
    probeCommand: async () => true,
    spawnCommand: vi.fn(() => process),
    timeoutMs: 1000
  });
  const result = adapter.sendMessage({ clientTurnId: 'client-1', message: 'Hi' });

  writeMessage(process, { id: 0, result: {} });
  await Promise.resolve();
  writeMessage(process, { id: 1, result: { thread: { id: 'thr_1' } } });
  process.emit('exit', 0);

  await expect(result).resolves.toMatchObject({
    failure: { category: 'interrupted' },
    state: 'failed'
  });
});
