/* global setTimeout */

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { expect, it, vi } from 'vitest';

import { createOnlineSmokeJsonRpcSession } from './foliole-aide-online-smoke-session.mjs';

it('buffers app-server JSONL messages split across stdout chunks', async () => {
  const child = new FakeCodexProcess();
  const requests = [];
  child.stdin.on('data', (chunk) => requests.push(String(chunk)));
  const session = createOnlineSmokeJsonRpcSession(child, 1_000);
  const initialized = session.request({ id: 0, method: 'initialize', params: {} });

  child.stdout.write('{"id":0,"res');
  child.stdout.write('ult":{}}\n');
  await expect(initialized).resolves.toMatchObject({ id: 0, result: {} });

  child.stdout.write(`${JSON.stringify({
    method: 'item/started',
    params: {
      item: { server: 'foliole_agent_control', tool: 'foliole_materials_read', type: 'mcpToolCall' },
      threadId: 'thread-1',
      turnId: 'turn-1'
    }
  })}\n`);
  child.stdout.write(`${JSON.stringify({
    id: 7,
    method: 'mcpServer/elicitation/request',
    params: { mode: 'form', serverName: 'foliole_agent_control', threadId: 'thread-1', turnId: 'turn-1' }
  })}\n`);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(requests.join('')).toContain('"action":"accept"');

  const completed = session.waitForTurn();
  child.stdout.write('{"method":"item/agentMessage/delta","params":{"delta":"Hel');
  child.stdout.write('lo"}}\n{"method":"turn/completed","params":{}}\n');
  await expect(completed).resolves.toBe('Hello');
  expect(child.kill).not.toHaveBeenCalled();
});

class FakeCodexProcess extends EventEmitter {
  stderr = new PassThrough();
  stdin = new PassThrough();
  stdout = new PassThrough();
  kill = vi.fn();
}
