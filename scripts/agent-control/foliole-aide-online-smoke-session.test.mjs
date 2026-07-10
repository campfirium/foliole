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
