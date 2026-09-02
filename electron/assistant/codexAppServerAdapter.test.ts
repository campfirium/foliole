// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { CodexAppServerAdapter } from './codexAppServerAdapter.js';
import { FakeCodexProcess, testMkdirSync, writeMessage } from './codexAppServerAdapter.testSupport.js';

const TEST_LAUNCHER_CWD = 'C:\\Foliole\\Widgets\\Foliole Aide';

function createAdapter(process: FakeCodexProcess) {
  const spawnCommand = vi.fn(() => process);
  return new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    command: 'codex',
    launcherCwd: TEST_LAUNCHER_CWD,
    mkdirSync: testMkdirSync,
    probeCommand: async () => true,
    spawnCommand,
    timeoutMs: 1000
  });
}

  it('handles an id-zero dynamic tool request without confusing it with initialize', async () => {
    const process = new FakeCodexProcess();
    const executeDynamicTool = vi.fn(async () => ({
      contentItems: [{ text: '{"material":{"id":"topic-1"}}', type: 'inputText' as const }],
      success: true
    }));
    const adapter = new CodexAppServerAdapter({
      appVersion: '0.6.5-test',
      command: 'codex',
      executeDynamicTool,
      launcherCwd: TEST_LAUNCHER_CWD,
      mkdirSync: testMkdirSync,
      probeCommand: async () => true,
      spawnCommand: () => process,
      timeoutMs: 1000
    });
    const responses: unknown[] = [];
    process.stdin.on('data', (chunk) => {
      for (const line of String(chunk).trim().split('\n').filter(Boolean)) {
        const message = JSON.parse(line);
        if (message.method === 'initialize') writeMessage(process, { id: 0, result: {} });
        else if (message.method === 'thread/start') {
          expect(message.params.dynamicTools).toHaveLength(1);
          writeMessage(process, { id: message.id, result: { thread: { id: 'thr_1' } } });
        } else if (message.method === 'turn/start') {
          writeMessage(process, { method: 'turn/started', params: { turn: { id: 'turn_1' } } });
          writeMessage(process, {
            id: 0,
            method: 'item/tool/call',
            params: {
              arguments: { id: 'topic-1' },
              callId: 'call-1',
              namespace: 'foliole',
              threadId: 'thr_1',
              tool: 'read_material',
              turnId: 'turn_1'
            }
          });
        } else if (message.id === 0 && message.result?.contentItems) {
          responses.push(message.result);
          writeMessage(process, { method: 'item/agentMessage/delta', params: { delta: 'Done' } });
          writeMessage(process, { method: 'turn/completed', params: { turn: { id: 'turn_1', status: 'completed' } } });
        }
      }
    });

    await expect(adapter.sendMessage({
      clientTurnId: 'client-1',
      message: 'Read it',
      workspaceContext: {
        agentControl: { capabilities: ['materials.read'], state: 'running' },
        schemaVersion: 1,
        scope: 'workspace'
      }
    })).resolves.toMatchObject({ message: { text: 'Done' }, state: 'ready' });
    expect(executeDynamicTool).toHaveBeenCalledWith({ arguments: { id: 'topic-1' }, tool: 'read_material' });
    expect(responses).toHaveLength(1);
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
        workspaceContext: {
          activeKind: 'topic',
          activeNodeId: 'topic-1',
          activeTitle: 'Topic',
          agentControl: {
            capabilities: ['materials.read', 'materials.search'],
            state: 'running'
          },
          document: { bodyStatus: 'ready', charCount: 11, preview: 'Loaded body', truncated: false },
          folder: {
            childCount: 1,
            children: [{ hasContent: true, kind: 'topic', nodeId: 'child-1', title: 'Child' }],
            truncated: false
          },
          path: ['Parent', 'Topic'],
          schemaVersion: 1,
          scope: 'node'
        }
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
    expect(seenInputs[0]).toContain('Active path: Parent / Topic');
    expect(seenInputs[0]).toContain('Active Foliole document body status: ready, 11 chars.');
    expect(seenInputs[0]).toContain('Active Foliole material id: topic-1');
    expect(seenInputs[0]).toContain('read a Topic, Folder, or Item');
    expect(seenInputs[0]).toContain('read the active Foliole item');
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
      command: 'codex',
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
    writeMessage(process, { method: 'item/agentMessage/delta', params: { delta: 'Done' } });
    writeMessage(process, { method: 'turn/completed', params: { turn: { status: 'completed' } } });
    await first;
    expect(process.kill).not.toHaveBeenCalled();
  });

  it('fails a completed turn that has no assistant text', async () => {
    const process = new FakeCodexProcess();
    const adapter = createAdapter(process);
    const result = adapter.sendMessage({ clientTurnId: 'client-1', message: 'Hi' });

    writeMessage(process, { id: 0, result: {} });
    await Promise.resolve();
    writeMessage(process, { id: 1, result: { thread: { id: 'thr_1' } } });
    writeMessage(process, { method: 'turn/completed', params: { turn: { status: 'completed' } } });

    await expect(result).resolves.toMatchObject({
      failure: { category: 'protocol_error' },
      state: 'failed'
    });
  });

  it('maps launch and protocol failures to sanitized categories', async () => {
    const unavailable = new CodexAppServerAdapter({
      appVersion: '0.6.5-test',
      command: 'codex',
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
  writeMessage(process, { method: 'turn/completed', params: { turn: { id: 'turn_1', status: 'completed' } } });
}

function throwMissingCodex(): never {
  const error = new Error('missing') as Error & { code: string };
  error.code = 'ENOENT';
  throw error;
}
