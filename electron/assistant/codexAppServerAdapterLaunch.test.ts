// @vitest-environment node

import { expect, it, vi } from 'vitest';

import type { NativeAssistantWorkspaceContext } from '../../lib/platform/nativeAssistantContract.js';

import { CodexAppServerAdapter } from './codexAppServerAdapter.js';
import { FakeCodexProcess, testMkdirSync, writeMessage } from './codexAppServerAdapter.testSupport.js';
import type { JsonRpcMessage } from './codexAppServerProtocol.js';

it('starts app-server with Agent Control MCP overrides and sends tool guidance', async () => {
  const process = new FakeCodexProcess();
  const capturedTurnInputs: string[] = [];
  const spawnCommand = vi.fn(() => process);
  const appServerArgs = createAgentControlAppServerArgs();
  const workspaceContext = createAgentControlWorkspaceContext();
  const cliPath = workspaceContext.agentControl?.cliPath;
  const cliCommand = `node ${cliPath} <route>`;
  const expectedCliPath = `Agent Control CLI path: ${cliPath}`;
  const expectedCliCommand = cliCommand;
  if (!cliPath) throw new Error('missing test cliPath');
  const adapter = new CodexAppServerAdapter({
    appServerArgs,
    appVersion: '0.6.5-test',
    launcherCwd: 'C:\\Foliole\\Widgets\\Foliole Aide',
    mkdirSync: testMkdirSync,
    probeCommand: async () => true,
    spawnCommand,
    timeoutMs: 1_000
  });
  process.stdin.on('data', (chunk) => {
    for (const line of String(chunk).trim().split('\n')) {
      if (line) handleAppServerRequest(process, JSON.parse(line), capturedTurnInputs);
    }
  });

  const result = await adapter.sendMessage({
    clientTurnId: 'client-1',
    message: 'Hi',
    workspaceContext
  });

  expect(spawnCommand).toHaveBeenCalledWith(
    'codex',
    ['app-server', ...appServerArgs],
    expect.objectContaining({ cwd: 'C:\\Foliole\\Widgets\\Foliole Aide' })
  );
  expect(result).toMatchObject({ message: { text: 'Ready', threadId: 'thread-1' }, state: 'ready' });
  expect(capturedTurnInputs).toHaveLength(1);
  expect(capturedTurnInputs[0]).toContain('foliole_materials_read');
  expect(capturedTurnInputs[0]).toContain('foliole_materials_search');
  expect(capturedTurnInputs[0]).toContain('foliole_materials_list_children');
  expect(capturedTurnInputs[0]).toContain(expectedCliPath);
  expect(capturedTurnInputs[0]).toContain(expectedCliCommand);
});

function createAgentControlAppServerArgs() {
  const descriptorPath = 'C:\\Foliole\\cache\\agent-control-session.json';
  const mcpServerPath = 'C:\\Foliole\\resources\\scripts\\agent-control\\foliole-mcp-server.mjs';
  return [
    '-c',
    'mcp_servers.foliole_agent_control.command="node"',
    '-c',
    `mcp_servers.foliole_agent_control.args=['${mcpServerPath}','--descriptor','${descriptorPath}']`
  ];
}

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
      cliPath: 'C:\\Foliole\\resources\\scripts\\agent-control\\foliole-agent.mjs',
      descriptorEnvVar: 'FOLIOLE_AGENT_DESCRIPTOR',
      descriptorPath: 'C:\\Foliole\\cache\\agent-control-session.json',
      endpoint: 'http://127.0.0.1:3841',
      state: 'running'
    },
    schemaVersion: 1,
    scope: 'workspace'
  };
}

function handleAppServerRequest(
  process: FakeCodexProcess,
  message: JsonRpcMessage,
  capturedTurnInputs: string[]
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
