// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { handleDynamicToolCall } from './codexAppServerDynamicToolCalls.js';
import type { TurnState } from './codexAppServerSessionTypes.js';

function createTurn(): TurnState {
  return {
    clientTurnId: 'client-1',
    dynamicToolCapabilities: ['materials.read'],
    finish: vi.fn(),
    text: '',
    threadId: 'thread-1',
    threadRequestId: 1,
    timeout: setTimeout(() => undefined, 10_000),
    timeoutMs: 10_000,
    turnId: 'turn-1',
    userMessage: 'Read it'
  };
}

it('rejects a tool response for a stale turn without executing it', async () => {
  const turn = createTurn();
  const execute = vi.fn();
  const write = vi.fn();

  await handleDynamicToolCall({
    execute,
    isCurrent: () => true,
    message: {
      id: 4,
      method: 'item/tool/call',
      params: {
        arguments: { id: 'topic-1' },
        namespace: 'foliole',
        threadId: 'thread-1',
        tool: 'read_material',
        turnId: 'stale-turn'
      }
    },
    onProtocolError: vi.fn(),
    refreshTimeout: vi.fn(),
    turn,
    write
  });

  expect(execute).not.toHaveBeenCalled();
  expect(write).toHaveBeenCalledWith(expect.objectContaining({
    id: 4,
    result: expect.objectContaining({ success: false })
  }));
  clearTimeout(turn.timeout);
});

it('drops a late tool result after the active turn changes', async () => {
  const turn = createTurn();
  const write = vi.fn();

  await handleDynamicToolCall({
    execute: async () => ({ contentItems: [{ text: '{}', type: 'inputText' }], success: true }),
    isCurrent: () => false,
    message: {
      id: 5,
      method: 'item/tool/call',
      params: {
        arguments: { id: 'topic-1' },
        namespace: 'foliole',
        threadId: 'thread-1',
        tool: 'read_material',
        turnId: 'turn-1'
      }
    },
    onProtocolError: vi.fn(),
    refreshTimeout: vi.fn(),
    turn,
    write
  });

  expect(write).not.toHaveBeenCalled();
  clearTimeout(turn.timeout);
});
