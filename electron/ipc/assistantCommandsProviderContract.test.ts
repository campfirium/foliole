// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-provider-tests';
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
    return { dispose: vi.fn(), getStatus: vi.fn(), sendMessage: adapterSendMessage };
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { upsertAssistantThreadIndex } from '../database/assistantThreadIndex.js';
import { appendAssistantThreadMessages } from '../database/assistantThreadMessages.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import { handleAssistantCommand, resetAssistantCommandAdapterForTests } from './assistantCommands.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-provider-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  adapterSendMessage.mockReset();
  resetAssistantCommandAdapterForTests();
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('rejects missing, unknown, and cross-provider thread ownership without fallback', async () => {
  await seedCodexThread();

  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Missing provider', openingLocation: { type: 'workspace' }
  })).resolves.toMatchObject({ failure: { category: 'protocol_error' } });
  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Unknown provider', openingLocation: { type: 'workspace' }, provider: 'unknown'
  })).resolves.toMatchObject({ failure: { category: 'protocol_error' } });
  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Wrong provider', openingLocation: { type: 'workspace' },
    provider: 'openai-compatible', providerThreadId: 'thread-1'
  })).resolves.toEqual({
    failure: { category: 'protocol_error' }, provider: 'openai-compatible', state: 'failed'
  });
  expect(adapterSendMessage).toHaveBeenCalledTimes(1);
});

it('keeps BYOK history readable but returns not_configured without provider fallback', async () => {
  upsertAssistantThreadIndex({
    agentToolVersion: 0, location: { type: 'workspace' }, message: 'Saved BYOK prompt',
    provider: 'openai-compatible', providerThreadId: 'byok-thread'
  });
  appendAssistantThreadMessages([{
    id: 'turn-1:user', provider: 'openai-compatible', providerThreadId: 'byok-thread',
    role: 'user', text: 'Saved BYOK prompt'
  }]);

  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadMessages, {
    provider: 'openai-compatible', providerThreadId: 'byok-thread'
  })).resolves.toEqual([expect.objectContaining({ text: 'Saved BYOK prompt' })]);
  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Continue', openingLocation: { type: 'workspace' },
    provider: 'openai-compatible', providerThreadId: 'byok-thread'
  })).resolves.toEqual({
    failure: { category: 'not_configured' }, provider: 'openai-compatible', state: 'failed'
  });
  expect(adapterSendMessage).not.toHaveBeenCalled();
});

it('updates only the provider-owned Foliole index status', async () => {
  await seedCodexThread();

  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantArchiveThreadIndex, {
    provider: 'codex-app-server', providerThreadId: 'thread-1'
  })).resolves.toMatchObject({ status: 'archived' });
  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantRemoveThreadFromHistory, {
    provider: 'codex-app-server', providerThreadId: 'thread-1'
  })).resolves.toMatchObject({ status: 'deleted' });
  expect(adapterSendMessage).toHaveBeenCalledTimes(1);
});

async function seedCodexThread() {
  adapterSendMessage.mockResolvedValueOnce({
    message: { text: 'Answer', threadId: 'thread-1' },
    provider: 'codex-app-server', state: 'ready'
  });
  await handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Prompt body', openingLocation: { type: 'workspace' }, provider: 'codex-app-server'
  });
}
