// @vitest-environment node
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { vi } from 'vitest';

export class FakeCodexProcess extends EventEmitter {
  readonly stderr = new PassThrough();
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly kill = vi.fn(() => undefined);
}

export function writeMessage(process: FakeCodexProcess, message: unknown) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

export const testMkdirSync = () => undefined;

export function respondToTurnProtocol(process: FakeCodexProcess, chunk: Buffer, seenMethods: string[], seenInputs: string[] = []) {
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

export function completeTurn(process: FakeCodexProcess) {
  writeMessage(process, { method: 'turn/started', params: { turn: { id: 'turn_1' } } });
  writeMessage(process, { method: 'item/agentMessage/delta', params: { delta: 'Hello' } });
  writeMessage(process, { method: 'item/agentMessage/delta', params: { text: ' world' } });
  writeMessage(process, { method: 'turn/completed', params: { turn: { id: 'turn_1', status: 'completed' } } });
}
