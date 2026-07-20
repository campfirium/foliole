// @vitest-environment node

import { expect, it, vi } from 'vitest';

import type { NativeAssistantWorkspaceContext } from '../../lib/platform/nativeAssistantContract.js';

import { CodexAppServerAdapter } from './codexAppServerAdapter.js';
import { FakeCodexProcess, testMkdirSync, writeMessage } from './codexAppServerAdapter.testSupport.js';
import type { JsonRpcMessage } from './codexAppServerProtocol.js';

it('starts a plain app-server and sends product-level Foliole guidance', async () => {
  const process = new FakeCodexProcess();
  const capturedThreadRequests: JsonRpcMessage[] = [];
  const capturedSkillRootRequests: JsonRpcMessage[] = [];
  const capturedTurnInputs: string[] = [];
  const capturedTurnRequests: JsonRpcMessage[] = [];
  const spawnCommand = vi.fn(() => process);
  const workspaceContext = createAgentControlWorkspaceContext();
  const adapter = new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    command: 'codex',
    developerInstructions: '# Foliole Aide\n\nUse Foliole tools.',
    launcherCwd: 'C:\\Users\\Tester\\AppData\\Roaming\\Foliole\\Aide\\Workspace',
    mkdirSync: testMkdirSync,
    probeCommand: async () => true,
    spawnCommand,
    skillRoots: ['D:\\Library\\Widgets\\Foliole Aide\\Skills'],
    timeoutMs: 1_000
  });
  process.stdin.on('data', (chunk) => {
    for (const line of String(chunk).trim().split('\n')) {
      if (line) handleAppServerRequest(
        process,
        JSON.parse(line),
        capturedThreadRequests,
        capturedSkillRootRequests,
        capturedTurnInputs,
        capturedTurnRequests
      );
    }
  });

  const result = await adapter.sendMessage({
    clientTurnId: 'client-1',
    message: 'Hi',
    workspaceContext
  });

  expectConfiguredLaunch(spawnCommand);
  expect(result).toMatchObject({ message: { text: 'Ready', threadId: 'thread-1' }, state: 'ready' });
  expectManagedSkillRoot(capturedSkillRootRequests[0]);
  expect(capturedTurnInputs).toHaveLength(1);
  expect(capturedTurnInputs[0]).toContain('read a Topic or Folder');
  expect(capturedTurnInputs[0]).not.toContain('update a Topic');
  expect(capturedTurnInputs[0]).not.toContain('MCP');
  expect(capturedTurnInputs[0]).not.toContain('FOLIOLE_AGENT_DESCRIPTOR');
  expect(capturedThreadRequests[0]?.params).toMatchObject({
    cwd: 'C:\\Users\\Tester\\AppData\\Roaming\\Foliole\\Aide\\Workspace',
    developerInstructions: '# Foliole Aide\n\nUse Foliole tools.'
  });
  expect(capturedTurnRequests[0]?.params).toMatchObject({
    approvalPolicy: 'never',
    cwd: 'C:\\Users\\Tester\\AppData\\Roaming\\Foliole\\Aide\\Workspace',
    sandboxPolicy: {
      networkAccess: 'restricted',
      type: 'externalSandbox'
    }
  });
});

function expectConfiguredLaunch(spawnCommand: ReturnType<typeof vi.fn>) {
  expect(spawnCommand).toHaveBeenCalledWith(
    'codex',
    ['app-server', '--disable', 'code_mode', '--disable', 'shell_tool', '--disable', 'unified_exec'],
    expect.objectContaining({ cwd: 'C:\\Users\\Tester\\AppData\\Roaming\\Foliole\\Aide\\Workspace' })
  );
}

function expectManagedSkillRoot(request: JsonRpcMessage | undefined) {
  expect(request).toMatchObject({
    method: 'skills/extraRoots/set',
    params: { extraRoots: ['D:\\Library\\Widgets\\Foliole Aide\\Skills'] }
  });
}

function createAgentControlWorkspaceContext(): NativeAssistantWorkspaceContext {
  return {
    agentControl: {
      capabilities: [
        'materials.read',
        'materials.search',
        'materials.listChildren',
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
  capturedThreadRequests: JsonRpcMessage[],
  capturedSkillRootRequests: JsonRpcMessage[],
  capturedTurnInputs: string[],
  capturedTurnRequests: JsonRpcMessage[]
) {
  if (message.id === 0) {
    writeMessage(process, { id: 0, result: {} });
    return;
  }
  if (message.method === 'skills/extraRoots/set') {
    capturedSkillRootRequests.push(message);
    writeMessage(process, { id: message.id, result: {} });
    return;
  }
  if (message.method === 'thread/start') {
    capturedThreadRequests.push(message);
    writeMessage(process, { id: message.id, result: { thread: { id: 'thread-1' } } });
    return;
  }
  if (message.method === 'turn/start') {
    capturedTurnRequests.push(message);
    capturedTurnInputs.push(readTurnInput(message));
    writeMessage(process, { method: 'turn/started', params: { turn: { id: 'turn-1' } } });
    writeMessage(process, { method: 'item/agentMessage/delta', params: { delta: 'Ready' } });
    writeMessage(process, { method: 'turn/completed', params: { turn: { id: 'turn-1', status: 'completed' } } });
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
