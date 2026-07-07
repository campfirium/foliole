// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-commands-tests';
const adapterSendMessage = vi.hoisted(() => vi.fn());
const adapterGetStatus = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: { getVersion: () => '0.6.5-test' }
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
      getStatus: adapterGetStatus,
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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-commands-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  adapterSendMessage.mockReset();
  adapterGetStatus.mockReset();
  resetAssistantCommandAdapterForTests();
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

describe('assistant commands', () => {
  it('records a thread index when send message succeeds with an opening location', async () => {
    adapterSendMessage.mockResolvedValue({
      message: { text: 'Answer', threadId: 'thread-1', turnId: 'turn-1' },
      provider: 'codex-app-server',
      state: 'ready'
    });

    await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
      message: 'Prompt body',
      openingLocation: { nodeId: 'node-1', type: 'node' }
    })).resolves.toMatchObject({
      message: { threadId: 'thread-1' },
      state: 'ready',
      threadIndex: {
        location: { nodeId: 'node-1', type: 'node' },
        preview: 'Prompt body',
        providerThreadId: 'thread-1'
      }
    });

    await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadIndex, {
      location: { nodeId: 'node-1', type: 'node' }
    })).resolves.toMatchObject([{ providerThreadId: 'thread-1' }]);
  });

  it('returns persistence failure when index writing fails after provider success', async () => {
    adapterSendMessage.mockResolvedValue({
      message: { text: 'Answer', threadId: ' ' },
      provider: 'codex-app-server',
      state: 'ready'
    });

    await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
      message: 'Prompt body',
      openingLocation: { nodeId: 'node-1', type: 'node' }
    })).resolves.toEqual({
      failure: { category: 'persistence_failed' },
      provider: 'codex-app-server',
      state: 'failed'
    });
  });

  it('updates Foliole-only index status', async () => {
    adapterSendMessage.mockResolvedValue({
      message: { text: 'Answer', threadId: 'thread-1' },
      provider: 'codex-app-server',
      state: 'ready'
    });
    await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
      message: 'Prompt body',
      openingLocation: { type: 'workspace' }
    });

    await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantArchiveThreadIndex, {
      providerThreadId: 'thread-1'
    })).resolves.toMatchObject({ status: 'archived' });
    await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantDeleteThreadIndex, {
      providerThreadId: 'thread-1'
    })).resolves.toMatchObject({ status: 'deleted' });
  });
});
