// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-thread-history-tests';
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
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import { handleAssistantCommand, resetAssistantCommandAdapterForTests } from './assistantCommands.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-thread-history-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  adapterSendMessage.mockReset();
  resetAssistantCommandAdapterForTests();
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('removes a thread from local Foliole Aide history without calling the provider', async () => {
  adapterSendMessage.mockResolvedValue({
    message: { text: 'Answer', threadId: 'thread-1' },
    provider: 'codex-app-server',
    state: 'ready'
  });
  await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Prompt body',
    openingLocation: { type: 'workspace' }
  });
  adapterSendMessage.mockClear();

  await expect(
    handleAssistantCommand(NATIVE_COMMANDS.assistantRemoveThreadFromHistory, {
      providerThreadId: 'thread-1'
    })
  ).resolves.toMatchObject({ status: 'deleted' });
  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadIndex, {}))
    .resolves.toEqual([]);
  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadIndex, { includeDeleted: true }))
    .resolves.toMatchObject([{ providerThreadId: 'thread-1', status: 'deleted' }]);
  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadMessages, {
    providerThreadId: 'thread-1'
  })).resolves.toEqual([]);
  expect(adapterSendMessage).not.toHaveBeenCalled();
});

it('keeps the legacy delete-thread command as a local history removal alias', async () => {
  adapterSendMessage.mockResolvedValue({
    message: { text: 'Answer', threadId: 'thread-legacy' },
    provider: 'codex-app-server',
    state: 'ready'
  });
  await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Prompt body',
    openingLocation: { type: 'workspace' }
  });
  adapterSendMessage.mockClear();

  await expect(
    handleAssistantCommand('assistant_delete_thread_index', {
      providerThreadId: 'thread-legacy'
    })
  ).resolves.toMatchObject({ status: 'deleted' });
  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadIndex, {}))
    .resolves.toEqual([]);
  expect(adapterSendMessage).not.toHaveBeenCalled();
});

it('queues local history reads behind an active asynchronous database transaction', async () => {
  const gate = createGate();
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'history-owner-test' });
  const transaction = port.transaction(async () => {
    gate.enter();
    await gate.wait;
  });
  await gate.entered;

  let settled = false;
  const history = handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadIndex, {})
    .finally(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);

  gate.release();
  await transaction;
  await expect(history).resolves.toEqual([]);
});

function createGate() {
  let enter!: () => void;
  let release!: () => void;
  return {
    enter: () => enter(),
    entered: new Promise<void>((resolve) => { enter = resolve; }),
    release: () => release(),
    wait: new Promise<void>((resolve) => { release = resolve; })
  };
}
