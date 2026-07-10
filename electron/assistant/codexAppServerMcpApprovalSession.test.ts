// @vitest-environment node
import { expect, it } from 'vitest';

import { CodexAppServerAdapter } from './codexAppServerAdapter.js';
import { FakeCodexProcess, testMkdirSync, writeMessage } from './codexAppServerAdapter.testSupport.js';

it('continues a turn after accepting a Foliole read-tool elicitation', async () => {
  const process = new FakeCodexProcess();
  const adapter = new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    launcherCwd: 'C:\\Foliole\\Widgets\\Foliole Aide',
    mkdirSync: testMkdirSync,
    spawnCommand: () => process,
    timeoutMs: 1_000
  });
  const responses: unknown[] = [];
  process.stdin.on('data', (chunk) => {
    for (const line of String(chunk).trim().split('\n').filter(Boolean)) {
      const message = JSON.parse(line);
      if (message.id === 0) writeMessage(process, { id: 0, result: {} });
      if (message.method === 'thread/start') {
        writeMessage(process, { id: message.id, result: { thread: { id: 'thread-1' } } });
      }
      if (message.method === 'turn/start') requestReadApproval(process);
      if (message.id === 99 && message.result) {
        responses.push(message.result);
        writeMessage(process, { method: 'item/agentMessage/delta', params: { delta: 'Read complete' } });
        writeMessage(process, { method: 'turn/completed', params: { turn: { id: 'turn-1' } } });
      }
    }
  });

  await expect(adapter.sendMessage({ clientTurnId: 'client-1', message: 'Read' })).resolves.toMatchObject({
    message: { text: 'Read complete', threadId: 'thread-1' },
    state: 'ready'
  });
  expect(responses).toEqual([{ action: 'accept', content: {} }]);
});

function requestReadApproval(process: FakeCodexProcess) {
  writeMessage(process, {
    method: 'item/started',
    params: {
      item: { server: 'foliole_agent_control', tool: 'foliole_materials_read', type: 'mcpToolCall' },
      threadId: 'thread-1',
      turnId: 'turn-1'
    }
  });
  writeMessage(process, {
    id: 99,
    method: 'mcpServer/elicitation/request',
    params: {
      mode: 'form',
      requestedSchema: { properties: {}, type: 'object' },
      serverName: 'foliole_agent_control',
      threadId: 'thread-1',
      turnId: 'turn-1'
    }
  });
}
