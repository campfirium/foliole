// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-persistence-failure-tests';
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
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import { handleAssistantCommand, resetAssistantCommandAdapterForTests } from './assistantCommands.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-persistence-failure-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  adapterSendMessage.mockReset();
  resetAssistantCommandAdapterForTests();
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('rolls back the thread index when transcript persistence fails', async () => {
  adapterSendMessage.mockResolvedValueOnce({
    message: { text: { invalid: 'sqlite-bind-value' }, threadId: 'thread-rollback', turnId: 'turn-rollback' },
    provider: 'codex-app-server', state: 'ready'
  });
  await expectSendFailure('persistence_failed');
});

it('returns a controlled failure when the provider send rejects', async () => {
  adapterSendMessage.mockRejectedValueOnce(new Error('provider failed'));
  await expectSendFailure('protocol_error');
});

it('does not persist a local thread when the provider returns an empty assistant answer', async () => {
  adapterSendMessage.mockResolvedValueOnce({
    message: { text: '', threadId: 'thread-empty', turnId: 'turn-empty' },
    provider: 'codex-app-server', state: 'ready'
  });
  await expectSendFailure('protocol_error');
});

async function expectSendFailure(category: 'persistence_failed' | 'protocol_error') {
  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantSendMessage, {
    message: 'Prompt body', openingLocation: { type: 'workspace' }, provider: 'codex-app-server'
  })).resolves.toEqual({
    failure: { category }, provider: 'codex-app-server', state: 'failed'
  });
  await expect(handleAssistantCommand(NATIVE_COMMANDS.assistantListThreadIndex, {
    includeDeleted: true
  })).resolves.toEqual([]);
}
