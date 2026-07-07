// @vitest-environment node
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { expect, it, vi } from 'vitest';

import { CodexAppServerAdapter } from './codexAppServerAdapter.js';

const TEST_LAUNCHER_CWD = 'C:\\Foliole\\Widgets\\Foliole Aide';
const testMkdirSync = () => undefined;

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
  const spawnCommand = vi.fn(() => process);
  return new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    launcherCwd: TEST_LAUNCHER_CWD,
    mkdirSync: testMkdirSync,
    probeCommand: async () => true,
    spawnCommand,
    timeoutMs: 1000
  });
}

  it('reports ready without starting app-server when the codex command is available', async () => {
    const probeCommand = vi.fn(async () => true);
    const spawnCommand = vi.fn();
    const adapter = new CodexAppServerAdapter({
      appVersion: '0.6.5-test',
      launcherCwd: TEST_LAUNCHER_CWD,
      mkdirSync: testMkdirSync,
      probeCommand,
      spawnCommand
    });

    await expect(adapter.getStatus()).resolves.toMatchObject({
      provider: 'codex-app-server',
      state: 'ready'
    });
    expect(probeCommand).toHaveBeenCalledWith(
      'codex',
      expect.objectContaining({ cwd: TEST_LAUNCHER_CWD })
    );
    expect(spawnCommand).not.toHaveBeenCalled();
  });

  it('reports not_configured status when codex is unavailable', async () => {
    const adapter = new CodexAppServerAdapter({
      appVersion: '0.6.5-test',
      launcherCwd: TEST_LAUNCHER_CWD,
      mkdirSync: testMkdirSync,
      probeCommand: async () => false
    });

    await expect(adapter.getStatus()).resolves.toMatchObject({
      failure: { category: 'not_configured' },
      state: 'unavailable'
    });
  });

  it('aggregates assistant deltas from a reusable app-server session', async () => {
    const process = new FakeCodexProcess();
    const adapter = createAdapter(process);
    const seenMethods: string[] = [];
    const seenInputs: string[] = [];
    const events: unknown[] = [];
    process.stdin.on('data', (chunk) => respondToTurnProtocol(process, chunk, seenMethods, seenInputs));

    await expect(
      adapter.sendMessage({
        clientTurnId: 'client-1',
        message: 'Summarize',
        onEvent: (event) => events.push(event),
        workspaceContext: { activeTitle: 'Topic', path: ['Parent', 'Topic'], scope: 'node' }
      })
    ).resolves.toEqual({
      message: { text: 'Hello world', threadId: 'thr_1', turnId: 'turn_1' },
      provider: 'codex-app-server',
      state: 'ready'
    });
    expect(seenMethods).toEqual(
      expect.arrayContaining(['initialize', 'thread/start', 'turn/start'])
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ clientTurnId: 'client-1', kind: 'delta', text: 'Hello world' }),
        expect.objectContaining({ clientTurnId: 'client-1', kind: 'completed' })
      ])
    );
    expect(seenInputs[0]).toContain('Current Foliole scope: node');
    expect(seenInputs[0]).toContain('Active path: Parent / Topic');
    expect(seenInputs[0]).toContain('User message:\nSummarize');
    expect(process.kill).not.toHaveBeenCalled();
    adapter.dispose();
    expect(process.kill).toHaveBeenCalledOnce();
  });

  it('resumes an existing thread before starting a turn', async () => {
    const process = new FakeCodexProcess();
    const adapter = createAdapter(process);
    const seenMethods: string[] = [];
    process.stdin.on('data', (chunk) => respondToTurnProtocol(process, chunk, seenMethods));

    await expect(
      adapter.sendMessage({ clientTurnId: 'client-1', message: 'Continue', providerThreadId: 'thr_existing' })
    ).resolves.toEqual({
      message: { text: 'Hello world', threadId: 'thr_existing', turnId: 'turn_1' },
      provider: 'codex-app-server',
      state: 'ready'
    });
    expect(seenMethods).toEqual(
      expect.arrayContaining(['initialize', 'thread/resume', 'turn/start'])
    );
    expect(seenMethods).not.toContain('thread/start');
  });

  it('keeps the app-server child alive across sequential sends', async () => {
    const process = new FakeCodexProcess();
    const spawnCommand = vi.fn(() => process);
    const adapter = new CodexAppServerAdapter({
      appVersion: '0.6.5-test',
      launcherCwd: TEST_LAUNCHER_CWD,
      mkdirSync: testMkdirSync,
      probeCommand: async () => true,
      spawnCommand,
      timeoutMs: 1000
    });
    const seenMethods: string[] = [];
    process.stdin.on('data', (chunk) => respondToTurnProtocol(process, chunk, seenMethods));

    await adapter.sendMessage({ clientTurnId: 'client-1', message: 'First' });
    await adapter.sendMessage({ clientTurnId: 'client-2', message: 'Second', providerThreadId: 'thr_1' });

    expect(spawnCommand).toHaveBeenCalledOnce();
    expect(seenMethods.filter((method) => method === 'initialize')).toHaveLength(1);
    expect(seenMethods).toEqual(
      expect.arrayContaining(['thread/start', 'thread/resume'])
    );
    expect(process.kill).not.toHaveBeenCalled();
  });

  it('rejects a resume response for a different thread', async () => {
    const process = new FakeCodexProcess();
    const adapter = createAdapter(process);
    const result = adapter.sendMessage({ clientTurnId: 'client-1', message: 'Continue', providerThreadId: 'thr_existing' });

    writeMessage(process, { id: 0, result: {} });
    await Promise.resolve();
    writeMessage(process, { id: 1, result: { thread: { id: 'thr_other' } } });

    await expect(result).resolves.toMatchObject({
      failure: { category: 'protocol_error' },
      state: 'failed'
    });
  });

  it('returns busy for a concurrent send without cancelling the active turn', async () => {
    const process = new FakeCodexProcess();
    const adapter = createAdapter(process);
    const first = adapter.sendMessage({ clientTurnId: 'client-1', message: 'First' });

    await expect(adapter.sendMessage({ clientTurnId: 'client-2', message: 'Second' })).resolves.toMatchObject({
      failure: { category: 'busy' },
      state: 'busy'
    });
    writeMessage(process, { id: 0, result: {} });
    await Promise.resolve();
    writeMessage(process, { id: 1, result: { thread: { id: 'thr_1' } } });
    writeMessage(process, { method: 'turn/completed', params: {} });
    await first;
    expect(process.kill).not.toHaveBeenCalled();
  });

  it('maps launch and protocol failures to sanitized categories', async () => {
    const unavailable = new CodexAppServerAdapter({
      appVersion: '0.6.5-test',
      launcherCwd: TEST_LAUNCHER_CWD,
      mkdirSync: testMkdirSync,
      spawnCommand: throwMissingCodex
    });
    await expect(unavailable.sendMessage({ clientTurnId: 'client-1', message: 'Hi' })).resolves.toMatchObject({
      failure: { category: 'not_configured' }
    });

    const overloadedProcess = new FakeCodexProcess();
    const overloaded = createAdapter(overloadedProcess);
    const result = overloaded.sendMessage({ clientTurnId: 'client-1', message: 'Hi' });
    writeMessage(overloadedProcess, {
      error: { code: -32001, message: 'Server overloaded; retry later.' },
      id: 0
    });
    await expect(result).resolves.toMatchObject({ failure: { category: 'overloaded' } });
  });

function respondToTurnProtocol(process: FakeCodexProcess, chunk: Buffer, seenMethods: string[], seenInputs: string[] = []) {
  for (const line of chunk.toString().trim().split('\n').filter(Boolean)) {
    const message = JSON.parse(line);
    seenMethods.push(message.method);
    if (message.id === 0) writeMessage(process, { id: 0, result: {} });
    if (message.method === 'thread/start' || message.method === 'thread/resume')
      writeMessage(process, {
        id: message.id,
        result: {
          thread: { id: message.method === 'thread/resume' ? message.params.threadId : 'thr_1' }
        }
      });
    if (message.method === 'turn/start') {
      seenInputs.push(message.params.input[0].text);
      completeTurn(process);
    }
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
