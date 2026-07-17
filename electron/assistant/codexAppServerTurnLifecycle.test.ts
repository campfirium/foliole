// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { CodexAppServerAdapter } from './codexAppServerAdapter.js';
import { FakeCodexProcess, testMkdirSync, writeMessage } from './codexAppServerAdapter.testSupport.js';

afterEach(() => vi.useRealTimers());

it('uses app-server activity as an idle timeout instead of an absolute turn deadline', async () => {
  vi.useFakeTimers();
  const process = new FakeCodexProcess();
  const adapter = createAdapter(process, 100);
  const result = adapter.sendMessage({ clientTurnId: 'client-1', message: 'Discuss this' });

  writeMessage(process, { id: 0, result: {} });
  await Promise.resolve();
  writeMessage(process, { id: 1, result: { thread: { id: 'thr_1' } } });
  await vi.advanceTimersByTimeAsync(90);
  writeMessage(process, { method: 'turn/started', params: { turn: { id: 'turn_1' } } });
  await vi.advanceTimersByTimeAsync(90);
  writeMessage(process, { method: 'item/mcpToolCall/progress', params: { message: 'Reading' } });
  await vi.advanceTimersByTimeAsync(90);
  writeMessage(process, { method: 'item/agentMessage/delta', params: { delta: 'Still here' } });
  await vi.advanceTimersByTimeAsync(90);
  writeMessage(process, {
    method: 'turn/completed',
    params: { turn: { id: 'turn_1', status: 'completed' } }
  });

  await expect(result).resolves.toMatchObject({ message: { text: 'Still here' }, state: 'ready' });
});

it('propagates a failed final status together with already streamed assistant text', async () => {
  const process = new FakeCodexProcess();
  const adapter = createAdapter(process, 1_000);
  const events: unknown[] = [];
  const result = adapter.sendMessage({
    clientTurnId: 'client-1',
    message: 'Discuss this',
    onEvent: (event) => events.push(event)
  });

  writeMessage(process, { id: 0, result: {} });
  await Promise.resolve();
  writeMessage(process, { id: 1, result: { thread: { id: 'thr_1' } } });
  writeMessage(process, { method: 'item/agentMessage/delta', params: { delta: 'Partial answer' } });
  writeMessage(process, {
    method: 'turn/completed',
    params: { turn: { error: { message: 'provider failed' }, status: 'failed' } }
  });

  await expect(result).resolves.toMatchObject({ failure: { category: 'internal_error' }, state: 'failed' });
  expect(events).toContainEqual(expect.objectContaining({
    failure: { category: 'internal_error' },
    kind: 'failed',
    text: 'Partial answer'
  }));
});

function createAdapter(process: FakeCodexProcess, timeoutMs: number) {
  return new CodexAppServerAdapter({
    appVersion: '0.6.5-test',
    command: 'codex',
    launcherCwd: 'C:\\Foliole\\Widgets\\Foliole Aide',
    mkdirSync: testMkdirSync,
    probeCommand: async () => true,
    spawnCommand: vi.fn(() => process),
    timeoutMs
  });
}
