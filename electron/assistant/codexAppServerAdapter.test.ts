// @vitest-environment node
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

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

function createAdapter(process: FakeCodexProcess) {
  return new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    probeCommand: async () => true,
    spawnCommand: () => process,
    timeoutMs: 1000
  });
}

describe('CodexAppServerAdapter status', () => {
  it('reports ready without starting app-server when the codex command is available', async () => {
    const probeCommand = vi.fn(async () => true);
    const spawnCommand = vi.fn();
    const adapter = new CodexAppServerAdapter({ appVersion: '0.6.5-test', probeCommand, spawnCommand });

    await expect(adapter.getStatus()).resolves.toMatchObject({ provider: 'codex-app-server', state: 'ready' });
    expect(probeCommand).toHaveBeenCalledWith('codex');
    expect(spawnCommand).not.toHaveBeenCalled();
  });

  it('reports not_configured status when codex is unavailable', async () => {
    const adapter = new CodexAppServerAdapter({ appVersion: '0.6.5-test', probeCommand: async () => false });

    await expect(adapter.getStatus()).resolves.toMatchObject({
      failure: { category: 'not_configured' },
      state: 'unavailable'
    });
  });
});

describe('CodexAppServerAdapter turn protocol', () => {
  it('aggregates assistant deltas from a short-lived app-server turn', async () => {
    const process = new FakeCodexProcess();
    const adapter = createAdapter(process);
    const seenMethods: string[] = [];
    process.stdin.on('data', (chunk) => respondToTurnProtocol(process, chunk, seenMethods));

    await expect(adapter.sendMessage({ message: 'Summarize' })).resolves.toEqual({
      message: { text: 'Hello world', threadId: 'thr_1', turnId: 'turn_1' },
      provider: 'codex-app-server',
      state: 'ready'
    });
    expect(seenMethods).toEqual(expect.arrayContaining(['initialize', 'thread/start', 'turn/start']));
    expect(process.kill).toHaveBeenCalled();
  });

  it('returns busy for a concurrent send without cancelling the active turn', async () => {
    const process = new FakeCodexProcess();
    const adapter = createAdapter(process);
    const first = adapter.sendMessage({ message: 'First' });

    await expect(adapter.sendMessage({ message: 'Second' })).resolves.toMatchObject({
      failure: { category: 'busy' },
      state: 'busy'
    });
    writeMessage(process, { id: 0, result: {} });
    writeMessage(process, { id: 1, result: { thread: { id: 'thr_1' } } });
    writeMessage(process, { method: 'turn/completed', params: {} });
    await first;
    expect(process.kill).toHaveBeenCalledTimes(1);
  });

  it('maps launch and protocol failures to sanitized categories', async () => {
    const unavailable = new CodexAppServerAdapter({ appVersion: '0.6.5-test', spawnCommand: throwMissingCodex });
    await expect(unavailable.sendMessage({ message: 'Hi' })).resolves.toMatchObject({
      failure: { category: 'not_configured' }
    });

    const overloadedProcess = new FakeCodexProcess();
    const overloaded = createAdapter(overloadedProcess);
    const result = overloaded.sendMessage({ message: 'Hi' });
    writeMessage(overloadedProcess, { error: { code: -32001, message: 'Server overloaded; retry later.' }, id: 0 });
    await expect(result).resolves.toMatchObject({ failure: { category: 'overloaded' } });
  });
});

function respondToTurnProtocol(process: FakeCodexProcess, chunk: Buffer, seenMethods: string[]) {
  for (const line of chunk.toString().trim().split('\n').filter(Boolean)) {
    const message = JSON.parse(line);
    seenMethods.push(message.method);
    if (message.id === 0) writeMessage(process, { id: 0, result: {} });
    if (message.id === 1) writeMessage(process, { id: 1, result: { thread: { id: 'thr_1' } } });
    if (message.id === 2) completeTurn(process);
  }
}

function completeTurn(process: FakeCodexProcess) {
  writeMessage(process, { method: 'turn/started', params: { turn: { id: 'turn_1' } } });
  writeMessage(process, { method: 'item/agentMessage/delta', params: { delta: 'Hello' } });
  writeMessage(process, { method: 'item/agentMessage/delta', params: { text: ' world' } });
  writeMessage(process, { method: 'turn/completed', params: { turn: { id: 'turn_1' } } });
}

function throwMissingCodex(): never {
  const error = new Error('missing') as Error & { code: string };
  error.code = 'ENOENT';
  throw error;
}