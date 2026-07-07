import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import {
  archiveAssistantThreadIndex,
  deleteAssistantThreadIndex,
  listAssistantThreadIndex,
  loadAssistantStatus,
  sendAssistantMessage
} from './assistantRuntime';

const bridge = vi.hoisted(() => ({ getRuntimeInvoke: vi.fn() }));

vi.mock('./bridge', () => ({ getRuntimeInvoke: bridge.getRuntimeInvoke }));

beforeEach(() => {
  bridge.getRuntimeInvoke.mockReset();
});

describe('assistantRuntime', () => {
  it('returns null when the runtime bridge is unavailable', async () => {
    bridge.getRuntimeInvoke.mockReturnValue(null);

    await expect(loadAssistantStatus()).resolves.toBeNull();
    await expect(sendAssistantMessage({ message: 'Hi' })).resolves.toBeNull();
    await expect(listAssistantThreadIndex()).resolves.toBeNull();
    await expect(archiveAssistantThreadIndex({ providerThreadId: 'thread-1' })).resolves.toBeNull();
    await expect(deleteAssistantThreadIndex({ providerThreadId: 'thread-1' })).resolves.toBeNull();
  });

  it('routes assistant calls through typed native commands', async () => {
    const invoke = vi.fn(async (command: string) => ({ command }));
    bridge.getRuntimeInvoke.mockReturnValue(invoke);
    const location = { nodeId: 'node-1', type: 'node' as const };

    await expect(loadAssistantStatus()).resolves.toEqual({ command: NATIVE_COMMANDS.assistantGetStatus });
    await expect(sendAssistantMessage({ message: 'Hi', openingLocation: location })).resolves.toEqual({
      command: NATIVE_COMMANDS.assistantSendMessage
    });
    await expect(listAssistantThreadIndex({ location })).resolves.toEqual({ command: NATIVE_COMMANDS.assistantListThreadIndex });
    await expect(archiveAssistantThreadIndex({ providerThreadId: 'thread-1' })).resolves.toEqual({
      command: NATIVE_COMMANDS.assistantArchiveThreadIndex
    });
    await expect(deleteAssistantThreadIndex({ providerThreadId: 'thread-1' })).resolves.toEqual({
      command: NATIVE_COMMANDS.assistantDeleteThreadIndex
    });

    expect(invoke).toHaveBeenNthCalledWith(1, NATIVE_COMMANDS.assistantGetStatus);
    expect(invoke).toHaveBeenNthCalledWith(2, NATIVE_COMMANDS.assistantSendMessage, { message: 'Hi', openingLocation: location });
    expect(invoke).toHaveBeenNthCalledWith(3, NATIVE_COMMANDS.assistantListThreadIndex, { location });
    expect(invoke).toHaveBeenNthCalledWith(4, NATIVE_COMMANDS.assistantArchiveThreadIndex, { providerThreadId: 'thread-1' });
    expect(invoke).toHaveBeenNthCalledWith(5, NATIVE_COMMANDS.assistantDeleteThreadIndex, { providerThreadId: 'thread-1' });
  });
});