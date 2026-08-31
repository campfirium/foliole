// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-thread-messages-tests';
const adapterSendMessage = vi.hoisted(() => vi.fn());
const agentControlContext = vi.hoisted((): {
  value: { capabilities: string[]; state: 'running' | 'stopped' };
} => ({ value: { capabilities: ['materials.read'], state: 'running' } }));

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

vi.mock('./assistantAgentControlStatus.js', () => ({
  loadAssistantAgentControlContext: vi.fn(async () => agentControlContext.value),
  mergeAssistantStatusWithAgentControl: vi.fn((status) => status)
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { openAssistantHistoryConnection } from '../database/assistantHistoryConnection.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import { handleAssistantCommand as handleAssistantCommandRaw, resetAssistantCommandAdapterForTests } from './assistantCommands.js';

let tempRoot = '';
const handleAssistantCommand: typeof handleAssistantCommandRaw = (command, args, sender) =>
  handleAssistantCommandRaw(command, withCodexProvider(command, args), sender);

function withCodexProvider(command: string, args: Record<string, unknown>) {
  return command === NATIVE_COMMANDS.assistantSendMessage
    || command === NATIVE_COMMANDS.assistantListThreadMessages
    ? { ...args, provider: 'codex-app-server' }
    : args;
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-thread-messages-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  adapterSendMessage.mockReset();
  agentControlContext.value = { capabilities: ['materials.read'], state: 'running' };
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

it('does not mark a new thread as tool-enabled when Agent tools were unavailable', async () => {
  agentControlContext.value = { capabilities: [], state: 'stopped' };
  adapterSendMessage.mockResolvedValue({
    message: { text: 'Answer', threadId: 'thread-without-tools', turnId: 'turn-1' },
    provider: 'codex-app-server',
    state: 'ready'
  });

  const result = await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Prompt body',
    openingLocation: { type: 'workspace' }
  });

  expect(result).toMatchObject({ threadIndex: { agentToolVersion: 0 } });
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
  await new Promise((resolve) => setTimeout(resolve, 2));
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

it('continues a version-one tool thread with the current tools and saved history', async () => {
  adapterSendMessage
    .mockResolvedValueOnce({
      message: { text: 'Old answer', threadId: 'thread-old', turnId: 'turn-old' },
      provider: 'codex-app-server',
      state: 'ready'
    })
    .mockResolvedValueOnce({
      message: { text: 'New answer', threadId: 'thread-new', turnId: 'turn-new' },
      provider: 'codex-app-server',
      state: 'ready'
    });

  await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Old question',
    openingLocation: { type: 'workspace' }
  });
  openAssistantHistoryConnection().driver.execute(
    'UPDATE assistant_thread_index SET agent_tool_version = 1 WHERE provider_thread_id = ?',
    ['thread-old']
  );
  agentControlContext.value = {
    capabilities: ['materials.read', 'materials.create', 'virtualFolders.addItems'],
    state: 'running'
  };
  const result = await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Continue now',
    openingLocation: { type: 'workspace' },
    providerThreadId: 'thread-old'
  });

  const sendInput = adapterSendMessage.mock.lastCall?.[0];
  expect(sendInput).toEqual(expect.objectContaining({
    continuationMessages: [
      expect.objectContaining({ role: 'user', text: 'Old question' }),
      expect.objectContaining({ role: 'assistant', text: 'Old answer' })
    ],
    workspaceContext: expect.objectContaining({
      agentControl: expect.objectContaining({
        capabilities: expect.arrayContaining(['materials.create', 'virtualFolders.addItems'])
      })
    })
  }));
  expect(sendInput).not.toHaveProperty('providerThreadId');
  expect(result).toMatchObject({
    message: { threadId: 'thread-new' },
    threadIndex: {
      agentToolVersion: 2,
      continuedFromThreadId: 'thread-old',
      providerThreadId: 'thread-new'
    }
  });
  await expectThreadTranscript('thread-new', [
    'Old question', 'Old answer', 'Continue now', 'New answer'
  ]);
  await expectThreadTranscript('thread-old', ['Old question', 'Old answer', 'Continue now']);
});

async function expectThreadTranscript(providerThreadId: string, expected: string[]) {
  const messages = await handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadMessages, {
    providerThreadId
  });
  expect(messages).toEqual(expect.any(Array));
  expect((messages as Array<{ text: string }>).map((message) => message.text)).toEqual(expected);
}
