import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import {
  archiveAssistantThreadIndex,
  loadAssistantImageAttachment,
  loadAssistantStorageInfo,
  listAssistantThreadIndex,
  listAssistantThreadMessages,
  loadAssistantStatus,
  removeAssistantThreadFromHistory,
  openAssistantStorageLocation,
  sendAssistantMessage,
  startAssistantChatGptLogin,
  subscribeAssistantStatusRefresh
} from './assistantRuntime';

const bridge = vi.hoisted(() => ({ getRuntimeInvoke: vi.fn() }));

vi.mock('./runtimeInvoke', () => ({ getRuntimeInvoke: bridge.getRuntimeInvoke }));

beforeEach(() => {
  bridge.getRuntimeInvoke.mockReset();
});

it('returns null when the runtime bridge is unavailable', async () => {
    bridge.getRuntimeInvoke.mockReturnValue(null);

    await expect(loadAssistantStatus()).resolves.toBeNull();
    await expect(sendAssistantMessage({ message: 'Hi', provider: 'codex-app-server' })).resolves.toBeNull();
    await expect(listAssistantThreadIndex()).resolves.toBeNull();
    await expect(listAssistantThreadMessages({ provider: 'codex-app-server', providerThreadId: 'thread-1' })).resolves.toBeNull();
    await expect(archiveAssistantThreadIndex({ provider: 'codex-app-server', providerThreadId: 'thread-1' })).resolves.toBeNull();
    await expect(loadAssistantImageAttachment('a'.repeat(64))).resolves.toBeNull();
    await expect(removeAssistantThreadFromHistory({ provider: 'codex-app-server', providerThreadId: 'thread-1' })).resolves.toBeNull();
    await expect(loadAssistantStorageInfo()).resolves.toBeNull();
    await expect(openAssistantStorageLocation()).resolves.toBe(false);
});

it('routes assistant calls through typed native commands', async () => {
    const invoke = vi.fn(async (command: string) => ({ command }));
    bridge.getRuntimeInvoke.mockReturnValue(invoke);
    const location = { nodeId: 'node-1', type: 'node' as const };

    await expect(loadAssistantStatus()).resolves.toEqual({
      command: NATIVE_COMMANDS.assistantGetStatus
    });
    await expect(
      sendAssistantMessage({
        message: 'Hi',
        openingLocation: location,
        provider: 'codex-app-server',
        providerThreadId: 'thread-1'
      })
    ).resolves.toEqual({
      command: NATIVE_COMMANDS.assistantSendMessage
    });
    await expect(listAssistantThreadIndex({ location })).resolves.toEqual({
      command: NATIVE_COMMANDS.assistantListThreadIndex
    });
    await expect(listAssistantThreadMessages({ provider: 'codex-app-server', providerThreadId: 'thread-1' })).resolves.toEqual({
      command: NATIVE_COMMANDS.assistantListThreadMessages
    });
    await expect(archiveAssistantThreadIndex({ provider: 'codex-app-server', providerThreadId: 'thread-1' })).resolves.toEqual({
      command: NATIVE_COMMANDS.assistantArchiveThreadIndex
    });
    await expect(loadAssistantImageAttachment('a'.repeat(64))).resolves.toEqual({
      command: NATIVE_COMMANDS.assistantReadImageAttachment
    });
    await expect(removeAssistantThreadFromHistory({ provider: 'codex-app-server', providerThreadId: 'thread-2' })).resolves.toEqual({
      command: NATIVE_COMMANDS.assistantRemoveThreadFromHistory
    });

    expect(invoke).toHaveBeenNthCalledWith(1, NATIVE_COMMANDS.assistantGetStatus);
    expect(invoke).toHaveBeenNthCalledWith(2, NATIVE_COMMANDS.assistantSendMessage, {
      message: 'Hi',
      openingLocation: location,
      provider: 'codex-app-server',
      providerThreadId: 'thread-1'
    });
    expect(invoke).toHaveBeenNthCalledWith(3, NATIVE_COMMANDS.assistantListThreadIndex, {
      location
    });
    expect(invoke).toHaveBeenNthCalledWith(4, NATIVE_COMMANDS.assistantListThreadMessages, {
      provider: 'codex-app-server',
      providerThreadId: 'thread-1'
    });
    expect(invoke).toHaveBeenNthCalledWith(5, NATIVE_COMMANDS.assistantArchiveThreadIndex, {
      provider: 'codex-app-server',
      providerThreadId: 'thread-1'
    });
    expect(invoke).toHaveBeenNthCalledWith(6, NATIVE_COMMANDS.assistantReadImageAttachment, {
      attachmentId: 'a'.repeat(64)
    });
    expect(invoke).toHaveBeenNthCalledWith(7, NATIVE_COMMANDS.assistantRemoveThreadFromHistory, {
      provider: 'codex-app-server',
      providerThreadId: 'thread-2'
    });
});

it('routes Aide storage calls through fixed native commands', async () => {
  const invoke = vi.fn(async (command: string) => ({ command }));
  bridge.getRuntimeInvoke.mockReturnValue(invoke);

  await expect(loadAssistantStorageInfo()).resolves.toEqual({
    command: NATIVE_COMMANDS.assistantGetStorageInfo
  });
  await expect(openAssistantStorageLocation()).resolves.toBe(true);

  expect(invoke).toHaveBeenNthCalledWith(1, NATIVE_COMMANDS.assistantGetStorageInfo);
  expect(invoke).toHaveBeenNthCalledWith(2, NATIVE_COMMANDS.assistantOpenStorageLocation);
});

it('notifies open Aide panels after ChatGPT login succeeds', async () => {
  const invoke = vi.fn(async () => ({ provider: 'codex-app-server', state: 'ready' }));
  const listener = vi.fn();
  bridge.getRuntimeInvoke.mockReturnValue(invoke);
  const unsubscribe = subscribeAssistantStatusRefresh(listener);

  await startAssistantChatGptLogin();

  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
});
