// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-commands-tests';
const adapterSendMessage = vi.hoisted(() => vi.fn());
const adapterGetStatus = vi.hoisted(() => vi.fn());
const adapterDispose = vi.hoisted(() => vi.fn());

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
      dispose: adapterDispose,
      getStatus: adapterGetStatus,
      sendMessage: adapterSendMessage
    };
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import {
  handleAssistantCommand,
  resetAssistantCommandAdapterForTests
} from './assistantCommands.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-commands-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  adapterSendMessage.mockReset();
  adapterGetStatus.mockReset();
  adapterDispose.mockReset();
  resetAssistantCommandAdapterForTests();
  initializeDatabaseConnection(openDatabaseConnection());

});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });

});
  it('records a thread index when send message succeeds with an opening location', async () => {
    adapterSendMessage.mockResolvedValue({
      message: { text: 'Answer', threadId: 'thread-1', turnId: 'turn-1' },
      provider: 'codex-app-server',
      state: 'ready'
    });

    await expect(
      handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
        message: 'Prompt body',
        openingLocation: { nodeId: 'node-1', type: 'node' }
      })
    ).resolves.toMatchObject({
      message: { threadId: 'thread-1' },
      state: 'ready',
      threadIndex: {
        location: { nodeId: 'node-1', type: 'node' },
        preview: 'Prompt body',
        providerThreadId: 'thread-1'
      }
    });

    await expect(
      handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadIndex, {
        location: { nodeId: 'node-1', type: 'node' }
      })
    ).resolves.toMatchObject([{ providerThreadId: 'thread-1' }]);
  });

  it('returns persistence failure when index writing fails after provider success', async () => {
    adapterSendMessage.mockResolvedValue({
      message: { text: 'Answer', threadId: ' ' },
      provider: 'codex-app-server',
      state: 'ready'
    });

    await expect(
      handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
        message: 'Prompt body',
        openingLocation: { nodeId: 'node-1', type: 'node' }
      })
    ).resolves.toEqual({
      failure: { category: 'persistence_failed' },
      provider: 'codex-app-server',
      state: 'failed'
    });
  });

  it('continues a thread only when the saved location matches', async () => {
    adapterSendMessage
      .mockResolvedValueOnce({
        message: { text: 'Answer', threadId: 'thread-1', turnId: 'turn-1' },
        provider: 'codex-app-server',
        state: 'ready'
      })
      .mockResolvedValueOnce({
        message: { text: 'Follow-up answer', threadId: 'thread-1', turnId: 'turn-2' },
        provider: 'codex-app-server',
        state: 'ready'
      });

    await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
      message: 'Prompt body',
      openingLocation: { nodeId: 'node-1', type: 'node' }
    });

    await expect(
      handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
        message: 'Follow-up',
        openingLocation: { nodeId: 'node-1', type: 'node' },
        providerThreadId: ' thread-1 '
      })
    ).resolves.toMatchObject({
      message: { threadId: 'thread-1' },
      state: 'ready',
      threadIndex: { providerThreadId: 'thread-1', preview: 'Follow-up' }
    });
    expect(adapterSendMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      message: 'Follow-up',
      providerThreadId: 'thread-1'
    }));
  });

  it('forwards typed turn events only to the requesting sender', async () => {
    adapterSendMessage.mockImplementation(async (input) => {
      input.onEvent({ clientTurnId: input.clientTurnId, kind: 'delta', provider: 'codex-app-server', text: 'Partial' });
      return {
        message: { text: 'Answer', threadId: 'thread-1' },
        provider: 'codex-app-server',
        state: 'ready'
      };
    });
    const sender = { isDestroyed: () => false, send: vi.fn() };

    await handleAssistantCommand(
      NATIVE_COMMANDS.assistantSendMessage,
      {
        clientTurnId: 'client-1',
        message: 'Prompt body',
        openingLocation: { type: 'workspace' }
      },
      sender as never
    );

    expect(sender.send).toHaveBeenCalledWith('foliole:assistant-turn-event', {
      clientTurnId: 'client-1',
      kind: 'delta',
      provider: 'codex-app-server',
      text: 'Partial'
    });
  });

  it('does not send a turn when the requested thread belongs to another location', async () => {
    adapterSendMessage.mockResolvedValueOnce({
      message: { text: 'Answer', threadId: 'thread-1', turnId: 'turn-1' },
      provider: 'codex-app-server',
      state: 'ready'
    });
    await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
      message: 'Prompt body',
      openingLocation: { nodeId: 'node-1', type: 'node' }
    });
    adapterSendMessage.mockClear();

    await expect(
      handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
        message: 'Wrong place',
        openingLocation: { nodeId: 'node-2', type: 'node' },
        providerThreadId: 'thread-1'
      })
    ).resolves.toEqual({
      failure: { category: 'protocol_error' },
      provider: 'codex-app-server',
      state: 'failed'
    });
    expect(adapterSendMessage).not.toHaveBeenCalled();
  });

  it('returns a controlled failure for invalid assistant thread ids and locations', async () => {
    await expect(
      handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
        message: 'Prompt body',
        openingLocation: { nodeId: ' ', type: 'node' }
      })
    ).resolves.toEqual({
      failure: { category: 'protocol_error' },
      provider: 'codex-app-server',
      state: 'failed'
    });

    await expect(
      handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
        message: 'Prompt body',
        openingLocation: { type: 'workspace' },
        providerThreadId: ' '
      })
    ).resolves.toEqual({
      failure: { category: 'protocol_error' },
      provider: 'codex-app-server',
      state: 'failed'
    });
    expect(adapterSendMessage).not.toHaveBeenCalled();
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

    await expect(
      handleAssistantCommand(NATIVE_COMMANDS.assistantArchiveThreadIndex, {
        providerThreadId: 'thread-1'
      })
    ).resolves.toMatchObject({ status: 'archived' });
    await expect(
      handleAssistantCommand(NATIVE_COMMANDS.assistantDeleteThreadIndex, {
        providerThreadId: 'thread-1'
      })
    ).resolves.toMatchObject({ status: 'deleted' });
  });
