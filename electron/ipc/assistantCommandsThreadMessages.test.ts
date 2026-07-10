// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-thread-messages-tests';
const adapterSendMessage = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: { getPath: () => mockedAppDataDir, getVersion: () => '0.6.5-test' }
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('../assistant/codexAppServerAdapter.js', () => ({
  CodexAppServerAdapter: vi.fn(function CodexAppServerAdapter() {
    return {
      dispose: vi.fn(),
      getStatus: vi.fn(),
      sendMessage: adapterSendMessage
    };
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import { handleAssistantCommand, resetAssistantCommandAdapterForTests } from './assistantCommands.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-thread-messages-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  adapterSendMessage.mockReset();
  resetAssistantCommandAdapterForTests();
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('stores and reads local messages for successful assistant turns', async () => {
  adapterSendMessage.mockResolvedValue({
    message: { text: 'Answer', threadId: 'thread-1', turnId: 'turn-1' },
    provider: 'codex-app-server',
    state: 'ready'
  });

  await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Prompt body',
    openingLocation: { type: 'workspace' }
  });

  await expect(
    handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadMessages, {
      providerThreadId: 'thread-1'
    })
  ).resolves.toEqual([
    expect.objectContaining({ role: 'user', text: 'Prompt body' }),
    expect.objectContaining({ role: 'assistant', text: 'Answer' })
  ]);
});

it('appends local messages when continuing an existing assistant thread', async () => {
  adapterSendMessage
    .mockResolvedValueOnce({
      message: { text: 'First answer', threadId: 'thread-1', turnId: 'turn-1' },
      provider: 'codex-app-server',
      state: 'ready'
    })
    .mockResolvedValueOnce({
      message: { text: 'Follow-up answer', threadId: 'thread-1', turnId: 'turn-2' },
      provider: 'codex-app-server',
      state: 'ready'
    });

  await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'First prompt',
    openingLocation: { type: 'workspace' }
  });
  await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Follow-up prompt',
    openingLocation: { type: 'workspace' },
    providerThreadId: 'thread-1'
  });

  await expect(
    handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadMessages, {
      providerThreadId: 'thread-1'
    })
  ).resolves.toEqual([
    expect.objectContaining({ id: 'turn-1:user', role: 'user', text: 'First prompt' }),
    expect.objectContaining({ id: 'turn-1:assistant', role: 'assistant', text: 'First answer' }),
    expect.objectContaining({ id: 'turn-2:user', role: 'user', text: 'Follow-up prompt' }),
    expect.objectContaining({ id: 'turn-2:assistant', role: 'assistant', text: 'Follow-up answer' })
  ]);
});

it('rolls back the thread index when transcript persistence fails', async () => {
  adapterSendMessage.mockResolvedValueOnce({
    message: {
      text: { invalid: 'sqlite-bind-value' },
      threadId: 'thread-rollback',
      turnId: 'turn-rollback'
    },
    provider: 'codex-app-server',
    state: 'ready'
  });

  await expect(
    handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
      message: 'Prompt body',
      openingLocation: { type: 'workspace' }
    })
  ).resolves.toEqual({
    failure: { category: 'persistence_failed' },
    provider: 'codex-app-server',
    state: 'failed'
  });
  await expect(
    handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadIndex, { includeDeleted: true })
  ).resolves.toEqual([]);
});

it('returns a controlled failure when the provider send rejects', async () => {
  adapterSendMessage.mockRejectedValueOnce(new Error('provider failed'));

  await expect(
    handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
      message: 'Prompt body',
      openingLocation: { type: 'workspace' }
    })
  ).resolves.toEqual({
    failure: { category: 'protocol_error' },
    provider: 'codex-app-server',
    state: 'failed'
  });
  await expect(
    handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadIndex, { includeDeleted: true })
  ).resolves.toEqual([]);
});

it('does not persist a local thread when the provider returns an empty assistant answer', async () => {
  adapterSendMessage.mockResolvedValueOnce({
    message: { text: '', threadId: 'thread-empty', turnId: 'turn-empty' },
    provider: 'codex-app-server',
    state: 'ready'
  });

  await expect(
    handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
      message: 'Prompt body',
      openingLocation: { type: 'workspace' }
    })
  ).resolves.toEqual({
    failure: { category: 'protocol_error' },
    provider: 'codex-app-server',
    state: 'failed'
  });
  await expect(
    handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadIndex, { includeDeleted: true })
  ).resolves.toEqual([]);
});
