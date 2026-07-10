// @vitest-environment node

import { expect, it, vi } from 'vitest';

import type { NativeAssistantWorkspaceContext } from '../../lib/platform/nativeAssistantContract.js';

import { CodexAppServerAdapter } from './codexAppServerAdapter.js';
import { FakeCodexProcess, testMkdirSync, writeMessage } from './codexAppServerAdapter.testSupport.js';
import type { JsonRpcMessage } from './codexAppServerProtocol.js';

it('starts a plain app-server and sends product-level Foliole guidance', async () => {
  const process = new FakeCodexProcess();
  const capturedTurnInputs: string[] = [];
  const capturedTurnRequests: JsonRpcMessage[] = [];
  const spawnCommand = vi.fn(() => process);
  const workspaceContext = createAgentControlWorkspaceContext();
  const adapter = new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    launcherCwd: 'C:\\Foliole\\Widgets\\Foliole Aide',
    mkdirSync: testMkdirSync,
    probeCommand: async () => true,
    spawnCommand,
    timeoutMs: 1_000
  });
  process.stdin.on('data', (chunk) => {
    for (const line of String(chunk).trim().split('\n')) {
      if (line) handleAppServerRequest(process, JSON.parse(line), capturedTurnInputs, capturedTurnRequests);
    }
  });

  const result = await adapter.sendMessage({
    clientTurnId: 'client-1',
    message: 'Hi',
    workspaceContext
  });

  expect(spawnCommand).toHaveBeenCalledWith(
    'codex',
    ['app-server'],
    expect.objectContaining({ cwd: 'C:\\Foliole\\Widgets\\Foliole Aide' })
  );
  expect(result).toMatchObject({ message: { text: 'Ready', threadId: 'thread-1' }, state: 'ready' });
  expect(capturedTurnInputs).toHaveLength(1);
  expect(capturedTurnInputs[0]).toContain('read a Topic or Folder');
  expect(capturedTurnInputs[0]).toContain('update a Topic');
  expect(capturedTurnInputs[0]).not.toContain('MCP');
  expect(capturedTurnInputs[0]).not.toContain('FOLIOLE_AGENT_DESCRIPTOR');
  expect(capturedTurnRequests[0]?.params).toMatchObject({
    approvalPolicy: 'never',
    cwd: 'C:\\Foliole\\Widgets\\Foliole Aide',
    sandboxPolicy: {
      networkAccess: true,
      type: 'workspaceWrite',
      writableRoots: ['C:\\Foliole\\Widgets\\Foliole Aide']
    }
  });
});

function createAgentControlWorkspaceContext(): NativeAssistantWorkspaceContext {
  return {
    agentControl: {
      capabilities: [
        'materials.read',
        'materials.search',
        'materials.listChildren',
        'materials.update',
        'virtualFolders.list',
        'virtualFolders.read'
      ],
      state: 'running'
    },
    schemaVersion: 1,
    scope: 'workspace'
  };
}

function handleAppServerRequest(
  process: FakeCodexProcess,
  message: JsonRpcMessage,
  capturedTurnInputs: string[],
  capturedTurnRequests: JsonRpcMessage[]
) {
  if (message.id === 0) {
    writeMessage(process, { id: 0, result: {} });
    return;
  }
  if (message.method === 'thread/start') {
    writeMessage(process, { id: message.id, result: { thread: { id: 'thread-1' } } });
    return;
  }
  if (message.method === 'turn/start') {
    capturedTurnRequests.push(message);
    capturedTurnInputs.push(readTurnInput(message));
    writeMessage(process, { method: 'turn/started', params: { turn: { id: 'turn-1' } } });
    writeMessage(process, { method: 'item/agentMessage/delta', params: { delta: 'Ready' } });
    writeMessage(process, { method: 'turn/completed', params: { turn: { id: 'turn-1' } } });
  }
}

function readTurnInput(message: JsonRpcMessage) {
  const params = message.params;
  if (!params || typeof params !== 'object' || !('input' in params)) return '';
  const [first] = Array.isArray(params.input) ? params.input : [];
  return first && typeof first === 'object' && 'text' in first && typeof first.text === 'string'
    ? first.text
    : '';
}
